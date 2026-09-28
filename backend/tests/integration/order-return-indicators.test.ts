import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { ReturnStatus } from '@prisma/client';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { indicatorsFromRecords } from '../../src/lib/order-return-indicators';
import { listAllOrders } from '../../src/modules/orders/order.service';
import { createAdmin, createCustomer, createStaffWith, bearer } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
async function fixtures() {
  const buyer = await createCustomer();
  const admin = await createAdmin();
  const product = await makeProduct((await makeCategory()).id, { variants: [{ stockQuantity: 10 }, { stockQuantity: 10 }] });
  let serial = 0;
  const make = () => prisma.order.create({ data: {
    orderNumber: `AS-IND-${++serial}`, userID: buyer.user.id, status: 'DELIVERED',
    deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street', deliveryCity: 'Beirut',
    subtotal: 110, discountAmount: 10, deliveryFee: 5, total: 105,
    items: { create: [2, 3].map((quantity, idx) => ({
      variantID: product.variants[idx].id, productName: 'Shirt', productSKU: 'SHIRT', variantSKU: `V-${idx}`,
      quantity, unitPrice: 20, lineTotal: quantity * 20, returnedQuantity: quantity,
    })) },
  }, include: { items: true } });
  type Fixture = Awaited<ReturnType<typeof make>>;
  const add = (order: Fixture, status: ReturnStatus, quantity = 1, amount = 20, whole = false) => prisma.return.create({ data: {
    orderID: order.id, status, refundAmount: 999, // summaries must use line amounts, not this scalar
    items: { create: whole ? order.items.map(line => ({ orderItemID: line.id, quantity: line.quantity, refundAmount: line.lineTotal }))
      : [{ orderItemID: order.items[0].id, quantity, refundAmount: amount,
        refundBreakdown: { cumulativeRefundCents: 99999 } }] },
  } });
  const none = await make();
  const pending = await make(); await add(pending, 'REQUESTED');
  const received = await make(); await add(received, 'RECEIVED', 2, 30);
  const marked = await make(); await add(marked, 'REFUNDED', 2, 30);
  const ignored = await make(); await add(ignored, 'REJECTED'); await add(ignored, 'CANCELLED');
  const mixed = await make(); await add(mixed, 'REFUNDED'); await add(mixed, 'RECEIVED'); await add(mixed, 'REQUESTED');
  const whole = await make(); await add(whole, 'RECEIVED', 5, 100, true);
  // Fulfillment status is independent, including a status-correction scenario.
  await prisma.order.update({ where: { id: whole.id }, data: { status: 'RETURNED' } });
  const transit = await make(); await add(transit, 'IN_TRANSIT');
  const approved = await make(); await add(approved, 'APPROVED');
  const zero = await make(); await add(zero, 'RECEIVED', 1, 0);
  return { buyer, admin, none, pending, received, marked, ignored, mixed, whole, transit, approved, zero };
}

describe('order return indicators and filters (reads only)', () => {
  it('filters using aggregated statuses and returns the same indicators as detail records', async () => {
    const f = await fixtures();
    const list = async (filter: string) => (await request(app).get(`/api/admin/orders?returnFilter=${filter}`)
      .set(bearer(f.admin.token)).expect(200)).body.orders;
    const ids = (orders: { id: string }[]) => orders.map(o => o.id).sort();
    expect(ids(await list('HAS_RETURN'))).toEqual(ids([f.pending, f.received, f.marked, f.mixed, f.whole, f.transit, f.approved, f.zero]));
    expect(ids(await list('IN_PROGRESS'))).toEqual(ids([f.pending, f.mixed, f.transit, f.approved]));
    expect(ids(await list('AWAITING_REFUND_MARKING'))).toEqual(ids([f.received, f.mixed, f.whole, f.zero]));
    expect(ids(await list('MARKED_REFUNDED'))).toEqual(ids([f.marked, f.mixed]));
    expect(ids(await list('AWAITING_APPROVAL'))).toEqual(ids([f.pending, f.mixed]));
    expect(ids(await list('IN_TRANSIT'))).toEqual([f.transit.id]);
    const wholeOnly = await request(app).get('/api/admin/orders?status=RETURNED&returnFilter=AWAITING_REFUND_MARKING')
      .set(bearer(f.admin.token)).expect(200);
    expect(ids(wholeOnly.body.orders)).toEqual([f.whole.id]);
    for (const row of await list('HAS_RETURN')) {
      const source = await prisma.order.findUniqueOrThrow({ where: { id: row.id }, include: { items: true, returns: { include: { items: true } } } });
      expect(row.returnIndicators).toEqual(indicatorsFromRecords(source));
    }
    await request(app).get('/api/admin/orders?returnFilter=INVALID').set(bearer(f.admin.token)).expect(400);
  });

  it('shares indicators across admin detail, customer history/detail and guest tracking without writes', async () => {
    const f = await fixtures();
    const expected = { physicallyReturnedUnits: 2, orderedUnits: 5, originalMerchandiseCents: 10000,
      markedRefundCents: 2000, awaitingMarkingCents: 2000, pendingRefundCents: 2000,
      returnStatus: 'PARTIALLY_RETURNED', refundStatus: 'PARTIALLY_MARKED' };
    const mine = await request(app).get('/api/orders/mine').set(bearer(f.buyer.token)).expect(200);
    expect(mine.body.orders.find((o: { id: string }) => o.id === f.mixed.id).returnIndicators).toMatchObject(expected);
    expect(mine.body.orders.find((o: { id: string }) => o.id === f.none.id).returnIndicators).toMatchObject({ returnStatus: 'NONE', physicallyReturnedUnits: 0 });
    for (const token of [f.buyer.token, f.admin.token]) {
      const detail = await request(app).get(`/api/orders/${f.mixed.id}`).set(bearer(token)).expect(200);
      expect(detail.body.order.returnIndicators).toMatchObject(expected);
    }
    const lookup = await request(app).post('/api/orders/lookup').send({ orderNumber: f.mixed.orderNumber, contact: '0791234567' }).expect(200);
    const before = await prisma.return.findMany({ include: { items: true } });
    const tracked = await request(app).get(`/api/orders/track/${lookup.body.token}`).expect(200);
    expect(tracked.body.order.returnIndicators).toMatchObject(expected);
    expect(await prisma.return.findMany({ include: { items: true } })).toEqual(before);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: f.mixed.id } })).status).toBe('DELIVERED');
    expect(Number((await prisma.orderItem.findUniqueOrThrow({ where: { id: f.mixed.items[0].id } })).lineTotal)).toBe(40);
    const other = await createCustomer();
    await request(app).get(`/api/orders/${f.mixed.id}`).set(bearer(other.token)).expect(404);
  });

  it('counts dashboard return requests once even with multiple items, and uses orders:view', async () => {
    const f = await fixtures();
    const staff = await createStaffWith(['orders:view']);
    const report = await request(app).get('/api/admin/orders/return-work').set(bearer(staff.token)).expect(200);
    expect(report.body).toEqual({ awaitingApproval: { count: 2, amountCents: 4000 }, inTransit: { count: 1, amountCents: 2000 },
      awaitingRefundMarking: { count: 4, amountCents: 15000 }, refundDue: { count: 4, amountCents: 15000 } });
    const dashboardOnly = await createStaffWith(['dashboard:view']);
    await request(app).get('/api/admin/orders/return-work').set(bearer(dashboardOnly.token)).expect(403);
    await request(app).get('/api/admin/orders/return-work').set(bearer(f.buyer.token)).expect(403);
    await request(app).get('/api/admin/orders/return-work').expect(401);
  });

  it('keeps the list aggregation query count constant as the number of orders grows', async () => {
    const f = await fixtures();
    // Direct service calls exclude authentication queries from this check.
    const { vi } = await import('vitest');
    const spy = vi.spyOn(prisma, '$queryRaw');
    try {
      await listAllOrders(['RETURNED']);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockClear();
      const all = await listAllOrders();
      expect(all).toHaveLength(10);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(all.find(o => o.id === f.whole.id)?.returnIndicators.returnStatus).toBe('FULLY_RETURNED');
    } finally { spy.mockRestore(); }
  });
});
