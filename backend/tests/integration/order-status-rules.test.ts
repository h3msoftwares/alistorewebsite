import { collectTestOrder } from '../helpers/collection';
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createAdmin, createStaffWith, bearer } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

vi.mock('../../src/lib/mailer', async (original) => ({
  ...await original<typeof import('../../src/lib/mailer')>(),
  sendOrderShippedEmail: vi.fn().mockResolvedValue(true),
}));
import { sendOrderShippedEmail } from '../../src/lib/mailer';

const app = buildApp();
async function setup() {
  const buyer = await createCustomer();
  const admin = await createAdmin();
  const category = await makeCategory();
  const product = await makeProduct(category.id, { variants: [{ stockQuantity: 10 }] });
  const variantId = product.variants[0].id;
  await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 4 }).expect(201);
  const checkout = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send({
    deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT',
  }).expect(201);
  const order = checkout.body.order;
  await collectTestOrder(order.id, admin.user.id);
  const status = (next: string) => request(app).patch(`/api/admin/orders/${order.id}/status`).set(bearer(admin.token)).send({ status: next });
  const correction = (next: string, expectedStatus: string, reason = 'Wrong status selected by staff', token = admin.token) =>
    request(app).patch(`/api/admin/orders/${order.id}/correction`).set(bearer(token)).send({ status: next, expectedStatus, reason });
  const stock = async () => (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQuantity;
  return { buyer, admin, order, status, correction, stock };
}

describe('Order status rules and explicit corrections', () => {
  it('advances sequentially, rejects skipped and backward steps, and preserves ETA editing', async () => {
    const p = await setup();
    await p.status('SHIPPED').expect(409);
    for (const next of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) await p.status(next).expect(200);
    for (const next of ['PENDING', 'CONFIRMED', 'SHIPPED']) await p.status(next).expect(409);
    await request(app).patch(`/api/admin/orders/${p.order.id}/status`).set(bearer(p.admin.token))
      .send({ status: 'DELIVERED', estimatedDeliveryDays: 3 }).expect(200);
    expect(await p.stock()).toBe(6);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: p.order.id } })).status).toBe('DELIVERED');
  });

  it('rejects both customer and guest cancellation once shipped', async () => {
    const p = await setup();
    await p.status('CONFIRMED').expect(200);
    await p.status('SHIPPED').expect(200);
    await request(app).post(`/api/orders/${p.order.id}/cancel`).set(bearer(p.buyer.token)).expect(409);
    const lookup = await request(app).post('/api/orders/lookup')
      .send({ orderNumber: p.order.orderNumber, contact: '0791234567' }).expect(200);
    await request(app).post(`/api/orders/track/${lookup.body.token}/cancel`).expect(409);
    expect(await p.stock()).toBe(6);
  });

  it('requires a reason and a separate permission, and records correction history atomically', async () => {
    const p = await setup();
    await p.status('CONFIRMED').expect(200);
    const staff = await createStaffWith(['orders:manage']);
    await p.correction('PENDING', 'CONFIRMED', 'Incorrect click', staff.token).expect(403);
    await p.correction('PENDING', 'CONFIRMED', '   ').expect(400);
    await p.correction('PENDING', 'PENDING').expect(409);
    const normalCount = await prisma.auditLog.count({ where: { entityID: p.order.id, action: 'order.status_changed' } });
    await p.correction('PENDING', 'CONFIRMED', '  Confirmed the wrong order  ').expect(200);
    expect(await p.stock()).toBe(6);
    expect(await prisma.auditLog.count({ where: { entityID: p.order.id, action: 'order.status_changed' } })).toBe(normalCount);
    expect(await prisma.auditLog.findFirstOrThrow({ where: { entityID: p.order.id, action: 'order.status_corrected' } })).toMatchObject({
      actorID: p.admin.user.id, metadata: { from: 'CONFIRMED', to: 'PENDING', reason: 'Confirmed the wrong order' },
    });
    // A genuinely incorrect confirmation can be corrected, then cancelled.
    await request(app).post(`/api/orders/${p.order.id}/cancel`).set(bearer(p.buyer.token)).expect(200);
    expect(await p.stock()).toBe(10);
    await p.correction('PENDING', 'CANCELLED').expect(409);
  });

  it('does not send shipping emails for a correction', async () => {
    const p = await setup();
    vi.mocked(sendOrderShippedEmail).mockClear();
    await p.correction('SHIPPED', 'PENDING').expect(200);
    expect(sendOrderShippedEmail).not.toHaveBeenCalled();
  });

  it('does not replay a shipping notification when advancing after a correction', async () => {
    const p = await setup();
    vi.mocked(sendOrderShippedEmail).mockClear();
    await p.status('CONFIRMED').expect(200);
    await p.status('SHIPPED').expect(200);
    await vi.waitFor(() => expect(sendOrderShippedEmail).toHaveBeenCalledTimes(1));
    await p.correction('CONFIRMED', 'SHIPPED').expect(200);
    await p.status('SHIPPED').expect(200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sendOrderShippedEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects stale concurrent corrections instead of overwriting a newer decision', async () => {
    const p = await setup();
    const results = await Promise.all([p.correction('CONFIRMED', 'PENDING'), p.correction('SHIPPED', 'PENDING')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.auditLog.count({ where: { entityID: p.order.id, action: 'order.status_corrected' } })).toBe(1);
    expect(await p.stock()).toBe(6);
  });

  it.each(['CANCELLED', 'RETURNED'])('restores stock once for a valid %s correction', async (next) => {
    const p = await setup();
    await p.correction(next, 'PENDING', 'All items remain in the store').expect(200);
    expect(await p.stock()).toBe(10);
    await p.correction('PENDING', next).expect(409);
    expect(await prisma.stockMovement.count({ where: { orderID: p.order.id, type: 'RETURN' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityID: p.order.id, action: 'order.cancelled' } })).toBe(0);
  });

  it.each(['REQUESTED', 'RECEIVED', 'REFUNDED'])('blocks reopening and restocking corrections when a %s return exists', async (returnStatus) => {
    const p = await setup();
    for (const next of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) await p.status(next).expect(200);
    const ret = await request(app).post(`/api/orders/${p.order.id}/returns`).set(bearer(p.buyer.token))
      .send({ items: [{ orderItemID: p.order.items[0].id, quantity: 2 }] }).expect(201);
    if (returnStatus !== 'REQUESTED') {
      for (const next of ['APPROVED', 'IN_TRANSIT', 'RECEIVED', ...(returnStatus === 'REFUNDED' ? ['REFUNDED'] : [])]) {
        await request(app).patch(`/api/admin/returns/${ret.body.return.id}/status`)
          .set(bearer(p.admin.token)).send({ status: next }).expect(200);
      }
    }
    const before = await p.stock();
    const movements = await prisma.stockMovement.count({ where: { orderID: p.order.id } });
    for (const next of ['PENDING', 'CONFIRMED', 'CANCELLED', 'RETURNED']) await p.correction(next, 'DELIVERED').expect(409);
    expect(await p.stock()).toBe(before);
    expect(await prisma.stockMovement.count({ where: { orderID: p.order.id } })).toBe(movements);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: p.order.id } })).status).toBe('DELIVERED');
    expect(await prisma.auditLog.count({ where: { entityID: p.order.id, action: 'order.status_corrected' } })).toBe(0);
  });
});
