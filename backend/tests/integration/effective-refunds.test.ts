import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { bearer, createAdmin, createCustomer, createStaffWith, signAccessToken } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
async function purchase(twoLines = false) {
  const buyer = await createCustomer(); const admin = await createAdmin();
  const category = await makeCategory();
  const product = await makeProduct(category.id, { over: { price: 20 }, variants: twoLines
    ? [{ stockQuantity: 10, size: 'M' }, { stockQuantity: 10, size: 'L' }] : [{ stockQuantity: 10 }] });
  for (const [index, variant] of product.variants.entries()) {
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: variant.id,
      quantity: twoLines ? index + 2 : 5 }).expect(201);
  }
  const response = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send({
    deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT',
  }).expect(201);
  const order = response.body.order;
  await prisma.order.update({ where: { id: order.id }, data: { deliveryFee: 10, total: 110 } });
  for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) {
    await request(app).patch(`/api/admin/orders/${order.id}/status`).set(bearer(admin.token)).send({ status }).expect(200);
  }
  const collect = (amount: number) => request(app).patch(`/api/admin/orders/${order.id}/collected`).set(bearer(admin.token))
    .send({ collected: true, amount, currency: 'USD', collectedAt: '2026-09-28T11:00:00Z', collectorName: 'Courier' });
  const reverse = (collectionID: string) => request(app).patch(`/api/admin/orders/${order.id}/collected`).set(bearer(admin.token))
    .send({ collected: false, collectionID, reason: 'Duplicate collection' });
  const received = (amounts = [20]) => prisma.return.create({ data: { orderID: order.id, status: 'RECEIVED',
    refundAmount: amounts.reduce((sum, amount) => sum + amount, 0), items: { create: amounts.map((refundAmount, index) => ({
      orderItemID: order.items[index].id, quantity: index + 1, refundAmount,
    })) } }, include: { items: true } });
  const mark = (id: string, body: object = {}, token = admin.token) => request(app).patch(`/api/admin/returns/${id}/status`)
    .set(bearer(token)).send({ status: 'REFUNDED', payout: { payerName: 'Test cashier' }, ...body });
  const summary = () => request(app).get(`/api/admin/orders/${order.id}/collections`).set(bearer(admin.token));
  return { buyer, admin, product, order, collect, reverse, received, mark, summary };
}
const adjustment = (merchandiseRefundCents: number) => ({ merchandiseRefundCents, refundAdjustmentReason: 'Store decision' });
const delivery = (deliveryRefundCents: number) => ({ deliveryRefundCents, deliveryRefundReason: 'Delivery service issue' });

describe('effective merchandise and explicit delivery refund marking', () => {
  it.each([1000, 3000, 0])('saves %i cents without rewriting calculated amounts, quantities or payment status', async amount => {
    const p = await purchase(); await p.collect(110).expect(200); const ret = await p.received();
    const response = await p.mark(ret.id, adjustment(amount)).expect(200);
    expect(Number(response.body.return.refundAmount)).toBe(20);
    expect(Number(response.body.return.refundedAmount)).toBe(amount / 100);
    expect(response.body.return.items[0]).toMatchObject({ quantity: 1, refundAmount: '20', refundedAmount: String(amount / 100) });
    expect(response.body.return).toMatchObject({ refundAdjustedBy: p.admin.user.id, refundAdjustmentReason: 'Store decision', deliveryRefundAmount: '0' });
    expect(response.body.return.refundAdjustedAt).toBeTruthy();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityID: ret.id, action: 'return.status_changed' } });
    expect(audit.metadata).toMatchObject({ calculatedRefundCents: 2000, effectiveRefundCents: amount,
      differenceCents: amount - 2000, reason: 'Store decision', deliveryRefundCents: 0,
      remainingRefundableBeforeCents: 10000, remainingRefundableAfterCents: 10000 - amount,
      remainingTotalRefundableAfterCents: 11000 - amount });
    expect(await prisma.auditLog.count({ where: { entityID: ret.id, action: 'return.refund_adjusted' } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus).toBe('COLLECTED');
    expect(await prisma.stockMovement.count({ where: { orderID: p.order.id, type: 'RETURN' } })).toBe(0);
  });
  it.each([undefined, '', '   '])('requires a nonblank reason for an adjustment (%j)', async refundAdjustmentReason => {
    const p = await purchase(); await p.collect(110).expect(200); const ret = await p.received();
    await p.mark(ret.id, { merchandiseRefundCents: 0, refundAdjustmentReason }).expect(400);
    expect((await prisma.return.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe('RECEIVED');
    expect(await prisma.auditLog.count({ where: { entityID: ret.id } })).toBe(0);
  });
  it.each([{ merchandiseRefundCents: -1 }, { deliveryRefundCents: -1 }, { merchandiseRefundCents: 0.1 }, { merchandiseRefundCents: 1000000000000 }])('rejects invalid cent input %j', async body => {
    const p = await purchase(); const ret = await p.received(); await p.mark(ret.id, body).expect(400);
  });
  it('defaults to calculated merchandise and zero delivery without an adjustment event', async () => {
    const p = await purchase(); await p.collect(110).expect(200); const ret = await p.received();
    const response = await p.mark(ret.id).expect(200);
    expect(response.body.return).toMatchObject({ refundedAmount: '20', deliveryRefundAmount: '0', refundAdjustedAt: null });
    expect(await prisma.auditLog.count({ where: { action: 'return.refund_adjusted' } })).toBe(0);
  });
  it('enforces the cumulative merchandise cap using effective amounts', async () => {
    const p = await purchase(); await p.collect(50).expect(200);
    const first = await p.received(); await p.mark(first.id, adjustment(3000)).expect(200);
    const second = await p.received(); await p.mark(second.id, adjustment(1001)).expect(409);
    await p.mark(second.id, adjustment(1000)).expect(200);
    expect((await p.summary().expect(200)).body).toMatchObject({ markedRefundedCents: 4000, remainingRefundableCents: 0 });
  });
  it('requires a delivery reason and enforces cumulative delivery caps', async () => {
    const p = await purchase(); await p.collect(110).expect(200);
    const first = await p.received(); await p.mark(first.id, { deliveryRefundCents: 100 }).expect(400);
    await p.mark(first.id, delivery(1001)).expect(409);
    await p.mark(first.id, delivery(600)).expect(200);
    const second = await p.received(); await p.mark(second.id, delivery(401)).expect(409);
    await p.mark(second.id, delivery(400)).expect(200);
    expect((await p.summary().expect(200)).body).toMatchObject({ markedDeliveryRefundedCents: 1000, remainingDeliveryRefundableCents: 0 });
  });
  it('allows the $10 reversal after $100 merchandise marking, then blocks the $10 delivery marking', async () => {
    const p = await purchase(); await p.collect(100).expect(200); const ten = await p.collect(10).expect(200);
    const merchandise = await p.received(); await p.mark(merchandise.id, adjustment(10000)).expect(200);
    await p.reverse(ten.body.record.id).expect(200);
    expect((await p.summary().expect(200)).body).toMatchObject({ collectedCents: 10000, markedRefundedCents: 10000,
      remainingRefundableCents: 0, remainingDeliveryRefundableCents: 1000, remainingTotalRefundableCents: 0 });
    const fee = await p.received([0]);
    const blocked = await p.mark(fee.id, delivery(1000)).expect(409);
    expect(blocked.body.error.meta.reason).toBe('EXCEEDS_NET_COLLECTED');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: fee.id } })).status).toBe('RECEIVED');
    expect(await prisma.auditLog.count({ where: { entityID: fee.id } })).toBe(0);
  });
  it('allows both full amounts when $110 remains collected and guards reversal including delivery', async () => {
    const p = await purchase(); await p.collect(100).expect(200); const ten = await p.collect(10).expect(200);
    const merchandise = await p.received(); await p.mark(merchandise.id, adjustment(10000)).expect(200);
    const fee = await p.received([0]); await p.mark(fee.id, delivery(1000)).expect(200);
    await p.reverse(ten.body.record.id).expect(409);
    expect((await p.summary().expect(200)).body).toMatchObject({ collectedCents: 11000, markedRefundedCents: 10000,
      markedDeliveryRefundedCents: 1000, remainingTotalRefundableCents: 0 });
  });
  it.each([7, 40])('reserves delivery first with partial collection of $%i', async collected => {
    const p = await purchase(); const record = await p.collect(collected).expect(200);
    const merchandiseCents = Math.max(0, collected - 10) * 100;
    const deliveryCents = Math.min(10, collected) * 100;
    const ret = await p.received();
    await p.mark(ret.id, { ...adjustment(merchandiseCents + 1), ...delivery(deliveryCents) }).expect(409);
    await p.mark(ret.id, { ...adjustment(merchandiseCents), ...delivery(deliveryCents + 1) }).expect(409);
    await p.mark(ret.id, { ...adjustment(merchandiseCents), ...delivery(deliveryCents) }).expect(200);
    expect((await p.summary().expect(200)).body).toMatchObject({ markedRefundedCents: merchandiseCents,
      markedDeliveryRefundedCents: deliveryCents, remainingTotalRefundableCents: 0 });
    await p.reverse(record.body.record.id).expect(409);
  });
  it.each(['merchandise', 'delivery'])('serializes concurrent adjusted %s markings under the order lock', async kind => {
    const p = await purchase(); await p.collect(110).expect(200);
    const a = await p.received(); const b = await p.received();
    const body = kind === 'merchandise' ? adjustment(6000) : { ...adjustment(0), ...delivery(700) };
    const results = await Promise.all([p.mark(a.id, body), p.mark(b.id, body)]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const summary = (await p.summary().expect(200)).body;
    expect(summary.markedRefundedCents + summary.markedDeliveryRefundedCents).toBeLessThanOrEqual(summary.collectedCents);
    expect(await prisma.auditLog.count({ where: { action: 'return.refund_adjusted' } })).toBe(1);
  });
  it('allocates the exact cent, keeps legacy amounts in analytics and subtracts delivery only once', async () => {
    const p = await purchase(true); await p.collect(110).expect(200); const ret = await p.received([10, 20]);
    await p.mark(ret.id, { ...adjustment(1001), ...delivery(400) }).expect(200);
    const saved = await prisma.returnItem.findMany({ where: { returnID: ret.id }, orderBy: { refundAmount: 'asc' } });
    expect(saved.map(item => Number(item.refundedAmount))).toEqual([3.34, 6.67]);
    expect(saved.map(item => Number(item.refundAmount))).toEqual([10, 20]);
    await prisma.return.create({ data: { orderID: p.order.id, status: 'REFUNDED', refundAmount: 5,
      items: { create: { orderItemID: p.order.items[0].id, quantity: 1, refundAmount: 5 } } } });
    const overview = (await request(app).get('/api/admin/analytics/overview').set(bearer(p.admin.token)).expect(200)).body;
    expect(overview.kpis).toMatchObject({ merchandiseValue: 100, merchandiseMarkedRefunded: 15.01, netMerchandiseValue: 84.99, deliveryRevenue: 6 });
    const sales = (await request(app).get('/api/admin/analytics/sales').set(bearer(p.admin.token)).expect(200)).body;
    expect(sales.byProduct.reduce((sum: number, row: { merchandiseMarkedRefunded: number }) => sum + row.merchandiseMarkedRefunded, 0)).toBeCloseTo(15.01);
    expect((await p.summary().expect(200)).body).toMatchObject({ markedRefundedCents: 1501, markedDeliveryRefundedCents: 400 });
    const detail = (await request(app).get(`/api/orders/${p.order.id}`).set(bearer(p.admin.token)).expect(200)).body;
    expect(detail.order.returnIndicators.markedRefundCents).toBe(1501);
  });
  it('serializes delivery markings against the stricter combined cap after reversal', async () => {
    const p = await purchase(); await p.collect(100).expect(200); const ten = await p.collect(10).expect(200);
    const merchandise = await p.received(); await p.mark(merchandise.id, adjustment(9500)).expect(200);
    await p.reverse(ten.body.record.id).expect(200); // $5 combined availability, $10 delivery category availability
    const a = await p.received([0]); const b = await p.received([0]);
    const results = await Promise.all([p.mark(a.id, delivery(400)), p.mark(b.id, delivery(400))]);
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(results.find(result => result.status === 409)!.body.error.meta.reason).toBe('EXCEEDS_NET_COLLECTED');
    expect((await p.summary().expect(200)).body).toMatchObject({ markedRefundedCents: 9500, markedDeliveryRefundedCents: 400,
      collectedCents: 10000, remainingTotalRefundableCents: 100 });
  });
  it('uses quantity weights if every calculated line amount is zero', async () => {
    const p = await purchase(true); await p.collect(110).expect(200); const ret = await p.received([0, 0]);
    await p.mark(ret.id, adjustment(100)).expect(200);
    const saved = await prisma.returnItem.findMany({ where: { returnID: ret.id }, orderBy: { quantity: 'asc' } });
    expect(saved.map(item => Number(item.refundedAmount))).toEqual([0.33, 0.67]);
  });
  it('requires refund marking permission and fresh authentication', async () => {
    const p = await purchase(); await p.collect(110).expect(200); const ret = await p.received();
    for (const permissions of [['orders:manage'], ['payments:manage'], ['returns:manage'], ['orders:manage', 'payments:manage']]) {
      const staff = await createStaffWith(permissions); await p.mark(ret.id, {}, staff.token).expect(403);
    }
    const both = await createStaffWith(['refunds:manage']);
    const stale = signAccessToken(both.user.id, 'STAFF', Math.floor(Date.now() / 1000) - 3600);
    const blocked = await p.mark(ret.id, {}, stale).expect(403); expect(blocked.body.error.code).toBe('STEP_UP_REQUIRED');
    await p.mark(ret.id, {}, both.token).expect(200);
  });
  it('hides internal reasons and actor metadata from customer and guest APIs while preserving admin visibility', async () => {
    const p = await purchase(); await p.collect(110).expect(200); const ret = await p.received();
    await prisma.returnItem.update({ where: { id: ret.items[0].id }, data: { refundBreakdown: { version: 1, refundCents: 2000 } } });
    await p.mark(ret.id, { ...adjustment(1000), ...delivery(300) }).expect(200);
    const token = 'effective-refund-guest-test';
    await prisma.orderAccessToken.create({ data: { orderID: p.order.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60000) } });
    for (const result of [
      await request(app).get(`/api/orders/${p.order.id}`).set(bearer(p.buyer.token)).expect(200),
      await request(app).get(`/api/orders/track/${token}`).expect(200),
    ]) {
      const visible = result.body.order.returns[0];
      expect(visible).toMatchObject({ refundedAmount: '10', deliveryRefundAmount: '3', refundWasAdjusted: true });
      for (const field of ['refundAdjustmentReason', 'refundAdjustedBy', 'refundAdjustedAt', 'deliveryRefundReason']) expect(visible).not.toHaveProperty(field);
      expect(visible.items[0].refundBreakdown).toBeNull();
    }
    const admin = await request(app).get(`/api/orders/${p.order.id}`).set(bearer(p.admin.token)).expect(200);
    expect(admin.body.order.returns[0]).toMatchObject({ refundAdjustmentReason: 'Store decision', deliveryRefundReason: 'Delivery service issue' });
  });
  it('rolls back line allocations, status and both audit rows if the adjustment audit fails', async () => {
    const p = await purchase(); await p.collect(110).expect(200); const ret = await p.received();
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_adjustment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'return.refund_adjusted' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER test_adjustment_audit BEFORE INSERT ON auditlog FOR EACH ROW EXECUTE FUNCTION fail_adjustment_audit()');
    try {
      await p.mark(ret.id, { ...adjustment(1000), ...delivery(1000) }).expect(500);
      const saved = await prisma.return.findUniqueOrThrow({ where: { id: ret.id }, include: { items: true } });
      expect(saved).toMatchObject({ status: 'RECEIVED', refundedAmount: null, deliveryRefundAmount: expect.anything() });
      expect(Number(saved.deliveryRefundAmount)).toBe(0); expect(saved.items[0].refundedAmount).toBeNull();
      expect(await prisma.auditLog.count({ where: { entityID: ret.id } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER test_adjustment_audit ON auditlog');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_adjustment_audit()');
    }
  });
});
