import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createGoodwill } from '../../src/modules/refunds/refund.service';
import { payoutToday } from '../../src/modules/refunds/refund.schema';
import { bearer, createAdmin, createCustomer, createStaffWith, signAccessToken } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
const payout = { payerName: 'Cashier', reference: '   ', note: '\t ' };
async function fixture() {
  const admin = await createAdmin(); const buyer = await createCustomer();
  const product = await makeProduct((await makeCategory()).id, { over: { price: 20 }, variants: [{ stockQuantity: 10 }] });
  const variant = product.variants[0];
  const order = await prisma.order.create({ data: { orderNumber: `REF-${randomUUID()}`, userID: buyer.user.id,
    status: 'DELIVERED', subtotal: 100, deliveryFee: 10, total: 110, deliveryName: 'Buyer', deliveryPhone: '0791234567',
    deliveryAddress: 'Street', deliveryCity: 'Beirut', items: { create: { variantID: variant.id, productName: product.nameEn,
      productSKU: product.sku, variantSKU: variant.sku, quantity: 5, unitPrice: 20, lineTotal: 100 } } }, include: { items: true } });
  const root = `/api/admin/orders/${order.id}`;
  const collect = (amount = 110) => request(app).patch(`${root}/collected`).set(bearer(admin.token)).send({ collected: true,
    amount, currency: 'USD', collectedAt: new Date().toISOString(), collectorName: 'Courier' });
  const reverse = (collectionID: string) => request(app).patch(`${root}/collected`).set(bearer(admin.token)).send({ collected: false, collectionID, reason: 'Duplicate' });
  const received = (amount = 20) => prisma.return.create({ data: { orderID: order.id, status: 'RECEIVED', refundAmount: amount,
    items: { create: { orderItemID: order.items[0].id, quantity: 1, refundAmount: amount } } } });
  const mark = (id: string, body = {}, token = admin.token) => request(app).patch(`/api/admin/returns/${id}/status`)
    .set(bearer(token)).send({ status: 'REFUNDED', ...body });
  const create = (amountCents = 1000, extra = {}, token = admin.token) => request(app).post(`${root}/goodwill-refunds`)
    .set(bearer(token)).send({ amountCents, reason: 'Private service issue', ...extra });
  const pay = (id: string, body = payout, token = admin.token) => request(app).post(`${root}/goodwill-refunds/${id}/pay`).set(bearer(token)).send(body);
  const cancel = (id: string, reason = 'No longer due', token = admin.token) => request(app).post(`${root}/goodwill-refunds/${id}/cancel`).set(bearer(token)).send({ reason });
  const summary = async () => (await request(app).get(`${root}/refunds`).set(bearer(admin.token)).expect(200)).body;
  return { admin, buyer, order, collect, reverse, received, mark, create, pay, cancel, summary };
}
describe('cash payouts and goodwill refunds', () => {
  it('requires payout for positive marking, creates exact effective merchandise plus delivery and audits atomically', async () => {
    const p = await fixture(); await p.collect().expect(200); const ret = await p.received();
    await p.mark(ret.id).expect(400);
    expect((await prisma.return.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe('RECEIVED');
    expect(await prisma.refundPayout.count()).toBe(0); expect(await prisma.auditLog.count({ where: { entityID: ret.id } })).toBe(0);
    const marked = (await p.mark(ret.id, { merchandiseRefundCents: 1500, refundAdjustmentReason: 'Agreed',
      deliveryRefundCents: 400, deliveryRefundReason: 'Delivery issue', payout }).expect(200)).body.return;
    expect(marked.payout).toMatchObject({ amount: '19', payerName: 'Cashier', method: 'CASH', reference: null, note: null });
    expect(marked.payout.paidOn.slice(0,10)).toBe(payoutToday());
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'refund.payout_recorded' } });
    expect(audit.metadata).toMatchObject({ orderID: p.order.id, returnID: ret.id, amountCents: 1900, actorID: p.admin.user.id,
      payerName: 'Cashier', remainingTotalRefundableBeforeCents: 11000, remainingTotalRefundableAfterCents: 9100 });
  });
  it('allows zero without collection or payout', async () => {
    const p = await fixture(); const ret = await p.received(0); await p.mark(ret.id).expect(200);
    expect(await prisma.refundPayout.count()).toBe(0);
  });
  it.each([{ payerName: ' ' }, { payerName: 'Cashier', paidOn: '2999-01-01' },
    { payerName: 'Cashier', paidOn: '2026-02-30' }, { payerName: 'Cashier', method: 'CARD' }])('rejects invalid payout %j', async invalid => {
    const p = await fixture(); await p.collect().expect(200); const ret = await p.received();
    await p.mark(ret.id, { payout: invalid }).expect(400);
    expect((await prisma.return.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe('RECEIVED');
    expect(await prisma.refundPayout.count()).toBe(0);
  });
  it('creates owed then pays once, with no revenue deduction until paid and no cancellation after payment', async () => {
    const p = await fixture(); await p.collect().expect(200);
    const refund = (await p.create().expect(201)).body.refund;
    expect(refund).toMatchObject({ status: 'OWED', payout: null });
    expect(await p.summary()).toMatchObject({ goodwillReservedCents: 1000, remainingTotalRefundableCents: 10000, remainingRefundableCents: 10000 });
    await p.pay(refund.id).expect(200); await p.pay(refund.id).expect(409); await p.cancel(refund.id).expect(409);
    expect(await prisma.refundPayout.count()).toBe(1);
    expect((await prisma.auditLog.findMany({ where: { entityID: refund.id }, orderBy: { createdAt: 'asc' } })).map(a => a.action)).toEqual(['goodwill.created', 'goodwill.paid']);
    expect(await p.summary()).toMatchObject({ goodwillReservedCents: 1000, remainingTotalRefundableCents: 10000 });
  });
  it('paid now creates and pays atomically, rolling back both and audits if the payout cannot be recorded', async () => {
    const p = await fixture(); await p.collect().expect(200);
    await expect(createGoodwill(p.order.id, { amountCents: 1000, reason: 'Issue', paidNow: true, payout }, randomUUID())).rejects.toThrow();
    expect(await prisma.goodwillRefund.count()).toBe(0); expect(await prisma.refundPayout.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'goodwill.' } } })).toBe(0);
    const response = (await p.create(1000, { paidNow: true, payout }).expect(201)).body.refund;
    expect(response).toMatchObject({ status: 'PAID', payout: { amount: '10', method: 'CASH' } });
    expect(await prisma.auditLog.count({ where: { action: { in: ['goodwill.created', 'goodwill.paid', 'refund.payout_recorded'] } } })).toBe(3);
  });
  it('requires collection, positive amount, reason, paid-now details and a cancellation reason', async () => {
    const p = await fixture(); await p.create().expect(409); await p.collect().expect(200);
    for (const amount of [0, -1, 1.5]) await p.create(amount).expect(400);
    await p.create(1000, { reason: ' ' }).expect(400); await p.create(1000, { paidNow: true }).expect(400);
    await p.create(1000, { payout }).expect(400);
    const refund = (await p.create(10000).expect(201)).body.refund;
    await p.create(1001).expect(409); await p.cancel(refund.id, ' ').expect(400);
    await p.cancel(refund.id, 'Customer withdrew request').expect(200);
    expect(await p.summary()).toMatchObject({ goodwillReservedCents: 0, remainingTotalRefundableCents: 11000 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'goodwill.cancelled' } });
    expect(audit.metadata).toMatchObject({ amountCents: 10000, reason: 'Customer withdrew request', payerName: null,
      remainingTotalRefundableBeforeCents: 1000, remainingTotalRefundableAfterCents: 11000 });
    await p.create(11000).expect(201);
  });
  it('owed goodwill reserves the combined cap without changing category caps', async () => {
    const p = await fixture(); await p.collect().expect(200); await p.create(2000).expect(201); const ret = await p.received(100);
    const blocked = await p.mark(ret.id, { payout }).expect(409); expect(blocked.body.error.meta.reason).toBe('EXCEEDS_NET_COLLECTED');
    await p.mark(ret.id, { merchandiseRefundCents: 8000, refundAdjustmentReason: 'Agreed', deliveryRefundCents: 1000,
      deliveryRefundReason: 'Issue', payout }).expect(200);
    expect(await p.summary()).toMatchObject({ goodwillReservedCents: 2000, markedRefundedCents: 8000,
      markedDeliveryRefundedCents: 1000, remainingTotalRefundableCents: 0 });
    await p.create(1).expect(409);
  });
  it.each([false, true])('blocks collection reversal for goodwill, paid=%s', async paidNow => {
    const p = await fixture(); const collection = await p.collect(20).expect(200);
    await p.create(1500, { paidNow, ...(paidNow ? { payout } : {}) }).expect(201);
    await p.reverse(collection.body.record.id).expect(409);
    expect((await p.summary()).collectedCents).toBe(2000);
  });
  it('serializes concurrent goodwill creation and marking under the same order lock', async () => {
    const p = await fixture(); await p.collect().expect(200); const ret = await p.received(70);
    const results = await Promise.all([p.create(7000), p.mark(ret.id, { payout })]);
    expect(results.map(r => r.status).sort()).toEqual(expect.arrayContaining([409]));
    expect(results.filter(r => [200,201].includes(r.status))).toHaveLength(1);
    const totals = await p.summary();
    expect(totals.markedRefundedCents + totals.markedDeliveryRefundedCents + totals.goodwillReservedCents).toBeLessThanOrEqual(totals.collectedCents);
  });
  it('serializes two concurrent goodwill reservations and honours partial collection with delivery', async () => {
    const p = await fixture(); await p.collect(40).expect(200);
    const results = await Promise.all([p.create(2500), p.create(2500)]);
    expect(results.map(r => r.status).sort()).toEqual([201,409]);
    const ret = await p.received(20);
    await p.mark(ret.id, { payout }).expect(409);
    await p.mark(ret.id, { merchandiseRefundCents: 500, refundAdjustmentReason: 'Agreed', deliveryRefundCents: 1000,
      deliveryRefundReason: 'Issue', payout }).expect(200);
    expect(await p.summary()).toMatchObject({ collectedCents: 4000, goodwillReservedCents: 2500,
      markedRefundedCents: 500, markedDeliveryRefundedCents: 1000, remainingTotalRefundableCents: 0 });
  });
  it('prevents database payout edits/deletes, unmatched evidence and a positive transition without evidence', async () => {
    const p = await fixture(); await p.collect().expect(200); const ret = await p.received();
    await expect(prisma.return.update({ where: { id: ret.id }, data: { status: 'REFUNDED' } })).rejects.toThrow(/Positive refund requires cash payout/);
    await p.mark(ret.id, { payout }).expect(200);
    const record = await prisma.refundPayout.findFirstOrThrow();
    await expect(prisma.refundPayout.update({ where: { id: record.id }, data: { payerName: 'Edited' } })).rejects.toThrow(/append-only/);
    await expect(prisma.refundPayout.delete({ where: { id: record.id } })).rejects.toThrow(/append-only/);
    const other = await p.received();
    await expect(prisma.$transaction(async tx => {
      await tx.return.update({ where: { id: other.id }, data: { status: 'REFUNDED' } });
      await tx.refundPayout.create({ data: { ...record, id: randomUUID(), returnID: other.id, amount: 1 } });
    })).rejects.toThrow(/must match/);
    expect((await prisma.return.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('RECEIVED');
  });
  it.each([[], ['orders:manage'], ['returns:manage'], ['payments:manage'], ['refunds:view']].map(permissions => ({ permissions })))('rejects goodwill mutations without refunds:manage: %j', async ({ permissions }) => {
    const p = await fixture(); await p.collect().expect(200); const refund = (await p.create().expect(201)).body.refund;
    const staff = await createStaffWith(permissions);
    await p.create(1000, {}, staff.token).expect(403); await p.pay(refund.id, payout, staff.token).expect(403);
    await p.cancel(refund.id, 'Cancel', staff.token).expect(403);
  });
  it('refunds:manage alone can create, pay and cancel; fresh authentication and ADMIN revocations apply', async () => {
    const p = await fixture(); await p.collect().expect(200); const staff = await createStaffWith(['refunds:manage']);
    const stale = signAccessToken(staff.user.id, 'STAFF', Math.floor(Date.now()/1000)-3600);
    expect((await p.create(1000, {}, stale).expect(403)).body.error.code).toBe('STEP_UP_REQUIRED');
    const refund = (await p.create(1000, {}, staff.token).expect(201)).body.refund;
    expect((await p.pay(refund.id, payout, stale).expect(403)).body.error.code).toBe('STEP_UP_REQUIRED');
    expect((await p.cancel(refund.id, 'Cancel', stale).expect(403)).body.error.code).toBe('STEP_UP_REQUIRED');
    await p.pay(refund.id, payout, staff.token).expect(200);
    const owed = (await p.create(1000, {}, staff.token).expect(201)).body.refund; await p.cancel(owed.id, 'Cancel', staff.token).expect(200);
    await prisma.user.update({ where: { id: p.admin.user.id }, data: { revokedPermissions: ['refunds:manage'] } });
    await p.create().expect(403);
    await p.create(1000, {}, p.buyer.token).expect(403);
  });
  it('includes owed goodwill in due indicators/filter/dashboard, deducts only paid goodwill at order level and protects public views', async () => {
    const p = await fixture(); await p.collect().expect(200); await p.received(20);
    const owed = (await p.create(1000).expect(201)).body.refund;
    const report = async () => (await request(app).get('/api/admin/analytics/sales').set(bearer(p.admin.token)).expect(200)).body;
    const before = await report();
    expect(before.summary).toMatchObject({ paidGoodwill: 0, netOrderRevenue: 100, netMerchandiseValue: 100, deliveryRevenue: 10, refundDueAmount: 30, refundDueCount: 2 });
    const indicators = (await request(app).get('/api/admin/orders?returnFilter=REFUND_DUE').set(bearer(p.admin.token)).expect(200)).body.orders[0].returnIndicators;
    expect(indicators).toMatchObject({ refundDueCount: 2, refundDueCents: 3000 });
    expect((await request(app).get('/api/admin/orders/return-work').set(bearer(p.admin.token)).expect(200)).body.refundDue).toEqual({ count: 2, amountCents: 3000 });
    const hidden = (await request(app).get(`/api/orders/${p.order.id}`).set(bearer(p.buyer.token)).expect(200)).body.order;
    expect(hidden.goodwillRefunds).toEqual([]); expect(hidden.returnIndicators).toMatchObject({ refundDueCount: 1, refundDueCents: 2000, owedGoodwillCents: 0 });
    await p.pay(owed.id).expect(200);
    const after = await report(); expect(after.summary).toMatchObject({ paidGoodwill: 10, netOrderRevenue: 90, netMerchandiseValue: 100, deliveryRevenue: 10, refundDueAmount: 20 });
    expect(after.revenueSeries[0].revenue).toBe(90);
    for (const key of ['byProduct','byCategory','bySize','byColour']) expect(after[key]).toEqual(before[key]);
    const dashboard = (await request(app).get('/api/admin/dashboard').set(bearer(p.admin.token)).expect(200)).body;
    expect(dashboard).toMatchObject({ totalRevenue: 90, merchandise: { paidGoodwill: 10 } });
    const token = randomUUID(); await prisma.orderAccessToken.create({ data: { orderID: p.order.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });
    for (const path of [`/api/orders/${p.order.id}`, `/api/orders/track/${token}`]) {
      const response = await request(app).get(path).set(bearer(p.buyer.token)).expect(200);
      expect(response.body.order.goodwillRefunds).toEqual([{ id: owed.id, status: 'PAID', amount: '10' }]);
      expect(JSON.stringify(response.body)).not.toContain('Private service issue'); expect(JSON.stringify(response.body)).not.toContain('Cashier');
    }
    await prisma.return.create({ data: { orderID: p.order.id, status: 'REFUNDED', refundAmount: 1,
      items: { create: { orderItemID: p.order.items[0].id, quantity: 1, refundAmount: 1 } } } });
    expect((await p.summary()).payouts).toHaveLength(1); // no legacy backfill
  });
});
