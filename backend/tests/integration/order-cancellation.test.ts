import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createStaffWith, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return {
    ...actual,
    sendOrderCancelledEmail: vi.fn().mockResolvedValue(true),
    sendOwnerOrderCancelledAlertEmail: vi.fn().mockResolvedValue(true),
  };
});
import { sendOrderCancelledEmail, sendOwnerOrderCancelledAlertEmail } from '../../src/lib/mailer';
const mockCustomerCancelEmail = vi.mocked(sendOrderCancelledEmail);
const mockOwnerCancelEmail = vi.mocked(sendOwnerOrderCancelledAlertEmail);

const app = buildApp();

let variantId: string;

const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

beforeEach(async () => {
  mockCustomerCancelEmail.mockClear();
  mockOwnerCancelEmail.mockClear();
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory(col.id);
  const p = await makeProduct(col.id, cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 10 }],
  });
  variantId = p.variants[0].id;
});

/** Places a real order as a verified logged-in customer (skips email-OTP —
 *  not the concern of these tests) and returns its id plus the buyer's token. */
async function placeOrder(quantity = 2) {
  const { user, token } = await createCustomer();
  await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity });
  const res = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
  expect(res.status).toBe(201);
  return { orderId: res.body.order.id as string, userId: user.id, token };
}

describe('Cancellation — CANCELLABLE_STATUSES boundary (before SHIPPED)', () => {
  it.each(['PENDING', 'CONFIRMED'])('customer can cancel a %s order and stock is restored', async (status) => {
    const { orderId, token } = await placeOrder(2);
    await prisma.order.update({ where: { id: orderId }, data: { status } });

    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(10); // back to the original 10
    expect(await prisma.stockMovement.count({ where: { type: 'RETURN', orderID: orderId } })).toBe(1);
  });

  it.each(['SHIPPED', 'DELIVERED'])('customer cannot cancel a %s order (409), stock is untouched', async (status) => {
    const { orderId, token } = await placeOrder(2);
    await prisma.order.update({ where: { id: orderId }, data: { status } });

    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(bearer(token));
    expect(res.status).toBe(409);

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(8); // unchanged — 10 - 2 from checkout
    expect(await prisma.order.findUnique({ where: { id: orderId } }))
      .toMatchObject({ status });
  });

  it('cancelling an already-cancelled order is a 409, not a double-refund', async () => {
    const { orderId, token } = await placeOrder(1);
    expect((await request(app).post(`/api/orders/${orderId}/cancel`).set(bearer(token))).status).toBe(200);
    const second = await request(app).post(`/api/orders/${orderId}/cancel`).set(bearer(token));
    expect(second.status).toBe(409);

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(10); // restored once, not twice
    expect(await prisma.stockMovement.count({ where: { type: 'RETURN', orderID: orderId } })).toBe(1);
  });
});

describe('Cancellation — audit + notifications', () => {
  it('customer cancellation writes an order.cancelled audit row and notifies the owner + customer', async () => {
    const { orderId, userId, token } = await placeOrder(1);
    const res = await request(app).post(`/api/orders/${orderId}/cancel`).set(bearer(token));
    expect(res.status).toBe(200);

    const rows = await prisma.auditLog.findMany({ where: { entityType: 'order', entityID: orderId, action: 'order.cancelled' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorID: userId });
    expect(rows[0].metadata).toMatchObject({ from: 'PENDING', via: 'customer' });

    expect(mockCustomerCancelEmail).toHaveBeenCalledTimes(1);
    expect(mockOwnerCancelEmail).toHaveBeenCalledTimes(1);
  });
});

describe('Regression: admin cancelling via the status dropdown now restores stock too', () => {
  // Before this fix, PATCH /api/admin/orders/:id/status with status:
  // 'CANCELLED' was a blind field update — no stock restoration, no
  // RETURN StockMovement, and it recorded 'order.status_changed' instead of
  // 'order.cancelled'. This proves that gap is actually closed, not just
  // that the customer-facing button works.
  it('restores stock, writes a RETURN movement, and audits order.cancelled (not order.status_changed)', async () => {
    const { orderId } = await placeOrder(3);
    const { user: staff, token: staffToken } = await createStaffWith(['orders:manage']);

    const before = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(before?.stockQuantity).toBe(7); // 10 - 3

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(staffToken))
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');

    const after = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(after?.stockQuantity).toBe(10); // fully restored — this is the bug fix

    expect(await prisma.stockMovement.count({ where: { type: 'RETURN', orderID: orderId } })).toBe(1);

    const cancelledRows = await prisma.auditLog.findMany({
      where: { entityType: 'order', entityID: orderId, action: 'order.cancelled' },
    });
    expect(cancelledRows).toHaveLength(1);
    expect(cancelledRows[0]).toMatchObject({ actorID: staff.id });
    expect(cancelledRows[0].metadata).toMatchObject({ via: 'admin' });

    // And critically, the old blind-update audit action must NOT have fired
    // for this transition — it went through the shared cancellation core.
    expect(
      await prisma.auditLog.count({ where: { entityType: 'order', entityID: orderId, action: 'order.status_changed' } })
    ).toBe(0);
  });

  it('an admin can force-cancel a SHIPPED order (not bound by CANCELLABLE_STATUSES)', async () => {
    const { orderId } = await placeOrder(2);
    await prisma.order.update({ where: { id: orderId }, data: { status: 'SHIPPED' } });
    const { token: staffToken } = await createStaffWith(['orders:manage']);

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(staffToken))
      .send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(10);
  });

  it('ordinary admin status transitions (not to CANCELLED) are unaffected — still a plain update', async () => {
    const { orderId } = await placeOrder(1);
    const { token: staffToken } = await createStaffWith(['orders:manage']);

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(staffToken))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CONFIRMED');

    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(variant?.stockQuantity).toBe(9); // untouched by this transition
    expect(
      await prisma.auditLog.count({ where: { entityType: 'order', entityID: orderId, action: 'order.status_changed' } })
    ).toBe(1);
  });
});
