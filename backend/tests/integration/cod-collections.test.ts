import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { bearer, createAdmin, createCustomer, createStaffWith, signAccessToken } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
async function purchase() {
  const buyer = await createCustomer(); const admin = await createAdmin();
  const cat = await makeCategory();
  const product = await makeProduct(cat.id, { over: { price: 20 }, variants: [{ stockQuantity: 10 }] });
  await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: product.variants[0].id, quantity: 5 }).expect(201);
  const res = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send({
    deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT',
  }).expect(201);
  const order = res.body.order;
  await prisma.order.update({ where: { id: order.id }, data: { deliveryFee: 10, total: 110 } });
  for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) await request(app).patch(`/api/admin/orders/${order.id}/status`).set(bearer(admin.token)).send({ status, ...(status === 'REFUNDED' ? { payout: { payerName: 'Test cashier' } } : {}) }).expect(200);
  const collect = (amount = 110, token = admin.token, extra = {}) => request(app).patch(`/api/admin/orders/${order.id}/collected`).set(bearer(token)).send({
    collected: true, amount, currency: 'USD', collectedAt: '2026-09-28T11:00:00Z', collectorName: 'Courier Alice', reference: 'COD receipt 001', ...extra,
  });
  const reverse = (id: string, reason = 'Receipt entered twice') => request(app).patch(`/api/admin/orders/${order.id}/collected`).set(bearer(admin.token)).send({ collected: false, collectionID: id, reason });
  const summary = () => request(app).get(`/api/admin/orders/${order.id}/collections`).set(bearer(admin.token));
  const received = async (amount = 20) => prisma.return.create({ data: { orderID: order.id, status: 'RECEIVED', refundAmount: amount,
    items: { create: { orderItemID: order.items[0].id, quantity: 1, refundAmount: amount } } } });
  const mark = (id: string) => request(app).patch(`/api/admin/returns/${id}/status`).set(bearer(admin.token)).send({ payout: { payerName: 'Test cashier' }, status: 'REFUNDED' });
  return { buyer, admin, product, order, collect, reverse, summary, received, mark };
}

describe('append-only COD collection evidence and refund marking cap', () => {
  it.each([undefined, null, '', '   '])('stores reference %j as null, including reversal history and audits', async (reference) => {
    const p = await purchase();
    const res = await p.collect(110, p.admin.token, { reference }).expect(200);
    expect(res.body.record.reference).toBeNull();
    expect((await prisma.codCollection.findUniqueOrThrow({ where: { id: res.body.record.id } })).reference).toBeNull();
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'collection.recorded' } })).metadata).toMatchObject({ reference: null });
    const correction = await p.reverse(res.body.record.id).expect(200);
    expect(correction.body.record.reference).toBeNull();
    expect((await p.summary().expect(200)).body.records.every((r: { reference: string | null }) => r.reference === null)).toBe(true);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'collection.corrected' } })).metadata).toMatchObject({ reference: null });
  });
  it.each([undefined, '', '   '])('still rejects missing or blank collector %j', async (collectorName) => {
    const p = await purchase();
    await p.collect(110, p.admin.token, { collectorName, reference: undefined }).expect(400);
    expect(await prisma.codCollection.count()).toBe(0);
  });
  it('blocks marking without evidence but allows physical receipt and restocking', async () => {
    const p = await purchase();
    const ret = await request(app).post(`/api/orders/${p.order.id}/returns`).set(bearer(p.buyer.token))
      .send({ items: [{ orderItemID: p.order.items[0].id, quantity: 1 }] }).expect(201);
    for (const status of ['APPROVED', 'IN_TRANSIT', 'RECEIVED']) await request(app).patch(`/api/admin/returns/${ret.body.return.id}/status`).set(bearer(p.admin.token)).send({ status, ...(status === 'REFUNDED' ? { payout: { payerName: 'Test cashier' } } : {}) }).expect(200);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.product.variants[0].id } })).stockQuantity).toBe(6);
    const blocked = await p.mark(ret.body.return.id).expect(409);
    expect(blocked.body.error.meta.reason).toBe('NO_COLLECTION_RECORDED');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: ret.body.return.id } })).status).toBe('RECEIVED');
    expect(await prisma.auditLog.count({ where: { entityID: ret.body.return.id, metadata: { path: ['to'], equals: 'REFUNDED' } } })).toBe(0);
    const list = await request(app).get('/api/admin/returns').set(bearer(p.admin.token)).expect(200);
    expect(list.body.returns[0].refundEligibility).toMatchObject({ blockReason: 'NO_COLLECTION_RECORDED', amountCents: 2000 });
  });
  it('records evidence, updates payment status only when fully collected, and atomically audits marking', async () => {
    const p = await purchase();
    const a = await p.collect(30).expect(200);
    expect(a.body.order.paymentStatus).toBe('PENDING');
    await p.collect(80).expect(200);
    const ret = await p.received(30);
    await p.mark(ret.id).expect(200);
    const summary = await p.summary().expect(200);
    expect(summary.body).toMatchObject({ expectedTotalCents: 11000, collectedCents: 11000, markedRefundedCents: 3000, remainingRefundableCents: 7000 });
    expect(summary.body.records).toHaveLength(2);
    expect(summary.body.records[0]).toMatchObject({ actorID: p.admin.user.id, currency: 'USD', collectorName: 'Courier Alice', reference: 'COD receipt 001' });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityID: ret.id, action: 'return.status_changed' } });
    expect(audit.metadata).toMatchObject({ refundCents: 3000, remainingRefundableBeforeCents: 10000, remainingRefundableAfterCents: 7000, currency: 'USD' });
    expect(await prisma.auditLog.count({ where: { entityID: p.order.id, action: 'collection.recorded' } })).toBe(2);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus).toBe('COLLECTED');
  });
  it('reserves delivery first and caps successive markings using incremental saved item amounts', async () => {
    const p = await purchase(); await p.collect(70).expect(200); // $60 merchandise cap
    const first = await p.received(40); await p.mark(first.id).expect(200);
    const over = await p.received(21); const blocked = await p.mark(over.id).expect(409);
    expect(blocked.body.error.meta).toMatchObject({ reason: 'EXCEEDS_REMAINING_REFUNDABLE', remainingRefundableCents: 2000 });
    const second = await p.received(20); await p.mark(second.id).expect(200);
    expect((await p.summary().expect(200)).body.remainingRefundableCents).toBe(0);
    expect((await prisma.returnItem.aggregate({ where: { return: { orderID: p.order.id, status: 'REFUNDED' } }, _sum: { refundAmount: true } }))._sum.refundAmount?.toString()).toBe('60');
  });
  it('gates whole-order return marking, without gating full receipt', async () => {
    const p = await purchase();
    await request(app).patch(`/api/admin/orders/${p.order.id}/status`).set(bearer(p.admin.token)).send({ status: 'RETURNED' }).expect(200);
    const ret = await prisma.return.findFirstOrThrow({ where: { orderID: p.order.id } });
    expect(ret.status).toBe('RECEIVED');
    await p.mark(ret.id).expect(409);
    await p.collect().expect(200); await p.mark(ret.id).expect(200);
    expect((await p.summary().expect(200)).body.remainingRefundableCents).toBe(0);
  });
  it('allows zero marking without evidence and writes its atomic audit', async () => {
    const p = await purchase(); const ret = await p.received(0); await p.mark(ret.id).expect(200);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityID: ret.id, action: 'return.status_changed' } })).metadata)
      .toMatchObject({ refundCents: 0, remainingRefundableBeforeCents: 0 });
  });
  it('serializes two different return markings so their sum cannot exceed the cap', async () => {
    const p = await purchase(); await p.collect(70).expect(200);
    const a = await p.received(40); const b = await p.received(40);
    const results = await Promise.all([p.mark(a.id), p.mark(b.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await p.summary().expect(200)).body).toMatchObject({ markedRefundedCents: 4000, remainingRefundableCents: 2000 });
  });
  it('rejects a reversal below marked refunds; permits a reversal otherwise, once, with a reason', async () => {
    const p = await purchase(); const a = await p.collect(70).expect(200); const b = await p.collect(40).expect(200);
    const ret = await p.received(50); await p.mark(ret.id).expect(200);
    await p.reverse(a.body.record.id).expect(409); // $40 collected < $50 marked
    await p.reverse(b.body.record.id, ' ').expect(400);
    await p.reverse(b.body.record.id).expect(200); // $70 >= $50
    await p.reverse(b.body.record.id).expect(409);
    const history = (await p.summary().expect(200)).body;
    expect(history).toMatchObject({ collectedCents: 7000, remainingRefundableCents: 1000 });
    const correction = history.records.find((r: { reversalOfID: string }) => r.reversalOfID === b.body.record.id);
    expect(Number(correction.amount)).toBe(-40);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'collection.corrected' } })).metadata)
      .toMatchObject({ amountCents: -4000, actorID: p.admin.user.id, reason: 'Receipt entered twice', reference: 'COD receipt 001' });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus).toBe('PENDING');
  });
  it('preserves exact sub-dollar cents when reversing evidence', async () => {
    const p = await purchase(); const a = await p.collect(0.25).expect(200); await p.reverse(a.body.record.id).expect(200);
    expect((await p.summary().expect(200)).body.collectedCents).toBe(0);
  });
  it('requires payments:manage and fresh authentication; accepts either reading permission', async () => {
    const p = await purchase(); const desk = await createStaffWith(['orders:manage']);
    await p.collect(110, desk.token).expect(403);
    await request(app).get(`/api/admin/orders/${p.order.id}/collections`).set(bearer(desk.token)).expect(200);
    const payments = await createStaffWith(['payments:manage'], 'Payments');
    await p.collect(110, payments.token).expect(200);
    await request(app).get(`/api/admin/orders/${p.order.id}/collections`).set(bearer(payments.token)).expect(200);
    const stale = signAccessToken(payments.user.id, 'STAFF', Math.floor(Date.now() / 1000) - 3600);
    const denied = await p.collect(1, stale).expect(403); expect(denied.body.error.code).toBe('STEP_UP_REQUIRED');
    const viewer = await createStaffWith(['payments:view'], 'Payments reader');
    await p.collect(1, viewer.token).expect(403);
    await request(app).get(`/api/admin/orders/${p.order.id}/collections`).set(bearer(viewer.token)).expect(200);
    await request(app).get(`/api/admin/orders/${p.order.id}/collections`).set(bearer(p.buyer.token)).expect(403);
  });
  it('rejects mismatched currency and missing evidence; records cannot be edited or deleted', async () => {
    const p = await purchase(); await p.collect(110, p.admin.token, { currency: 'EUR' }).expect(400);
    await request(app).patch(`/api/admin/orders/${p.order.id}/collected`).set(bearer(p.admin.token)).send({ collected: true }).expect(400);
    const a = await p.collect().expect(200);
    await expect(prisma.codCollection.update({ where: { id: a.body.record.id }, data: { reference: 'Changed' } })).rejects.toThrow(/append-only/);
    await expect(prisma.codCollection.delete({ where: { id: a.body.record.id } })).rejects.toThrow(/append-only/);
    expect(await prisma.codCollection.count()).toBe(1);
  });
  it.each(['collection.recorded', 'collection.corrected', 'return.status_changed'])('rolls back the money action if atomic audit %s fails', async (action) => {
    const p = await purchase();
    const evidence = action === 'collection.recorded' ? null : await p.collect().expect(200);
    const ret = action === 'return.status_changed' ? await p.received(20) : null;
    // Deliberately fail the audit insert in the dedicated test DB. The money
    // write and payment/status update must roll back along with it.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_money_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = '${action}' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER test_money_audit BEFORE INSERT ON auditlog FOR EACH ROW EXECUTE FUNCTION fail_money_audit()');
    try {
      if (ret) await p.mark(ret.id).expect(500);
      else if (evidence) await p.reverse(evidence.body.record.id).expect(500);
      else await p.collect().expect(500);
      expect(await prisma.codCollection.count()).toBe(evidence ? 1 : 0);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: p.order.id } })).paymentStatus).toBe(evidence ? 'COLLECTED' : 'PENDING');
      if (ret) expect((await prisma.return.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe('RECEIVED');
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER test_money_audit ON auditlog');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_money_audit()');
    }
  });
});
