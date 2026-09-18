import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createAdmin, createStaffWith, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let variantId: string;

const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Amman',
  deliveryRegion: 'MOUNT_LEBANON',
};

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory();
  const p = await makeProduct(cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 10 }],
  });
  variantId = p.variants[0].id;
});

/** Logged-in customer: add `quantity` of the shared test variant to cart,
 *  check out, and (as an admin) fast-forward straight to DELIVERED — the
 *  plain status branch allows any non-terminal jump, so no need to step
 *  through CONFIRMED/SHIPPED first. */
async function deliveredOrder(quantity = 4) {
  const buyer = await createCustomer();
  const admin = await createAdmin();
  await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity });
  const checkout = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send(delivery);
  expect(checkout.status).toBe(201);
  const orderId = checkout.body.order.id as string;
  const orderItemId = checkout.body.order.items[0].id as string;
  const orderNumber = checkout.body.order.orderNumber as string;
  const deliver = await request(app)
    .patch(`/api/admin/orders/${orderId}/status`)
    .set(bearer(admin.token))
    .send({ status: 'DELIVERED' });
  expect(deliver.status).toBe(200);
  return { buyer, admin, orderId, orderItemId, orderNumber };
}

describe('Per-item returns', () => {
  it('rejects a return request on an order that is not DELIVERED', async () => {
    const buyer = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 2 });
    const checkout = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send(delivery);
    const orderId = checkout.body.order.id as string;
    const orderItemId = checkout.body.order.items[0].id as string;

    const res = await request(app)
      .post(`/api/orders/${orderId}/returns`)
      .set(bearer(buyer.token))
      .send({ items: [{ orderItemID: orderItemId, quantity: 1 }] });
    expect(res.status).toBe(409);
  });

  it('requests a partial return, embeds it on GET /api/orders/:id, and rejects over-returning', async () => {
    const { buyer, orderId, orderItemId } = await deliveredOrder(4);

    const res = await request(app)
      .post(`/api/orders/${orderId}/returns`)
      .set(bearer(buyer.token))
      .send({ items: [{ orderItemID: orderItemId, quantity: 2 }], reason: 'Wrong size' });
    expect(res.status).toBe(201);
    expect(res.body.return.status).toBe('REQUESTED');
    expect(res.body.return.items).toHaveLength(1);
    expect(Number(res.body.return.refundAmount)).toBe(40); // 2 * $20

    const order = await request(app).get(`/api/orders/${orderId}`).set(bearer(buyer.token));
    expect(order.body.order.returns).toHaveLength(1);
    expect(order.body.order.returns[0].id).toBe(res.body.return.id);

    // Only 2 of 4 units are left returnable (2 already claimed above).
    const tooMany = await request(app)
      .post(`/api/orders/${orderId}/returns`)
      .set(bearer(buyer.token))
      .send({ items: [{ orderItemID: orderItemId, quantity: 3 }] });
    expect(tooMany.status).toBe(409);

    // Exactly the remainder succeeds.
    const rest = await request(app)
      .post(`/api/orders/${orderId}/returns`)
      .set(bearer(buyer.token))
      .send({ items: [{ orderItemID: orderItemId, quantity: 2 }] });
    expect(rest.status).toBe(201);
  });

  it('a guest can request and cancel a return via their tracking token, which releases the claim', async () => {
    const { orderItemId, orderNumber } = await deliveredOrder(2);

    // Guest-token routes are exercised against a token minted through the
    // real "I lost my link" fallback — /orders/lookup — rather than a full
    // guest checkout + email-OTP round trip, which is exercised elsewhere.
    const lookup = await request(app)
      .post('/api/orders/lookup')
      .send({ orderNumber, contact: delivery.deliveryPhone });
    expect(lookup.status).toBe(200);
    const token = lookup.body.token as string;

    const req = await request(app)
      .post(`/api/orders/track/${token}/returns`)
      .send({ items: [{ orderItemID: orderItemId, quantity: 1 }] });
    expect(req.status).toBe(201);
    const returnId = req.body.return.id as string;

    const cancel = await request(app).post(`/api/orders/track/${token}/returns/${returnId}/cancel`).send();
    expect(cancel.status).toBe(200);
    expect(cancel.body.return.status).toBe('CANCELLED');

    // Cancelling released the claim — the same quantity can be requested again.
    const again = await request(app)
      .post(`/api/orders/track/${token}/returns`)
      .send({ items: [{ orderItemID: orderItemId, quantity: 1 }] });
    expect(again.status).toBe(201);
  });

  it('rejects a malformed request body before touching the order', async () => {
    const { buyer, orderId } = await deliveredOrder(2);
    const res = await request(app).post(`/api/orders/${orderId}/returns`).set(bearer(buyer.token)).send({});
    expect(res.status).toBe(400);
  });

  it('walks a return through the full admin lifecycle and restocks only on RECEIVED', async () => {
    const { buyer, admin, orderId, orderItemId } = await deliveredOrder(4);
    const orderItem = await prisma.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });
    const before = await prisma.productVariant.findUniqueOrThrow({ where: { id: orderItem.variantID } });

    const create = await request(app)
      .post(`/api/orders/${orderId}/returns`)
      .set(bearer(buyer.token))
      .send({ items: [{ orderItemID: orderItemId, quantity: 3 }] });
    expect(create.status).toBe(201);
    const returnId = create.body.return.id as string;

    // Illegal jump straight to RECEIVED is refused.
    const illegal = await request(app)
      .patch(`/api/admin/returns/${returnId}/status`)
      .set(bearer(admin.token))
      .send({ status: 'RECEIVED' });
    expect(illegal.status).toBe(409);

    for (const status of ['APPROVED', 'IN_TRANSIT', 'RECEIVED'] as const) {
      const res = await request(app)
        .patch(`/api/admin/returns/${returnId}/status`)
        .set(bearer(admin.token))
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.return.status).toBe(status);
    }

    const afterReceived = await prisma.productVariant.findUniqueOrThrow({ where: { id: orderItem.variantID } });
    expect(afterReceived.stockQuantity).toBe(before.stockQuantity + 3);

    const movement = await prisma.stockMovement.findFirst({ where: { orderItemID: orderItemId, type: 'RETURN' } });
    expect(movement).toMatchObject({ quantity: 3 });

    const refunded = await request(app)
      .patch(`/api/admin/returns/${returnId}/status`)
      .set(bearer(admin.token))
      .send({ status: 'REFUNDED' });
    expect(refunded.status).toBe(200);

    // Bookkeeping only — the order's own paymentStatus is untouched, and
    // stock doesn't move again on REFUNDED.
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.paymentStatus).toBe('PENDING');
    const afterRefunded = await prisma.productVariant.findUniqueOrThrow({ where: { id: orderItem.variantID } });
    expect(afterRefunded.stockQuantity).toBe(afterReceived.stockQuantity);
  });

  it('rejecting a return releases the claim', async () => {
    const { buyer, admin, orderId, orderItemId } = await deliveredOrder(2);

    const create = await request(app)
      .post(`/api/orders/${orderId}/returns`)
      .set(bearer(buyer.token))
      .send({ items: [{ orderItemID: orderItemId, quantity: 2 }] });
    const returnId = create.body.return.id as string;

    const rejected = await request(app)
      .patch(`/api/admin/returns/${returnId}/status`)
      .set(bearer(admin.token))
      .send({ status: 'REJECTED' });
    expect(rejected.status).toBe(200);

    const again = await request(app)
      .post(`/api/orders/${orderId}/returns`)
      .set(bearer(buyer.token))
      .send({ items: [{ orderItemID: orderItemId, quantity: 2 }] });
    expect(again.status).toBe(201);
  });

  it('gates the admin list/status routes on orders:view / orders:manage', async () => {
    await deliveredOrder(1);
    const viewOnly = await createStaffWith(['orders:view']);
    const noPerms = await createStaffWith([]);

    expect((await request(app).get('/api/admin/returns').set(bearer(noPerms.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/returns').set(bearer(viewOnly.token))).status).toBe(200);

    const patch = await request(app)
      .patch('/api/admin/returns/00000000-0000-4000-8000-000000000000/status')
      .set(bearer(viewOnly.token))
      .send({ status: 'APPROVED' });
    expect(patch.status).toBe(403); // has view, not manage
  });

  it('blocks the legacy whole-order RETURNED status while a per-item return is active', async () => {
    const { buyer, admin, orderId, orderItemId } = await deliveredOrder(2);
    await request(app)
      .post(`/api/orders/${orderId}/returns`)
      .set(bearer(buyer.token))
      .send({ items: [{ orderItemID: orderItemId, quantity: 1 }] });

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(admin.token))
      .send({ status: 'RETURNED' });
    expect(res.status).toBe(409);
  });
});
