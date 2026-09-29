import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHash, randomUUID } from 'node:crypto';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { bearer, createAdmin, createCustomer, createStaffWith } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';
import { collectTestOrder } from '../helpers/collection';
import { recordCollection } from '../../src/modules/payments/collection.service';

const app = buildApp();
const delivery = { deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT' };
async function purchase(aQty = 2, bQty = 1, extra = false, sale = false, secondBundle = false) {
  const admin = await createAdmin(); const buyer = await createCustomer(); const category = await makeCategory();
  const a = await makeProduct(category.id, { over: { price: sale ? 35 : 30, ...(sale ? { saleType: 'AMOUNT', saleValue: 5 } : {}) }, variants: [{ stockQuantity: 100 }] });
  const b = await makeProduct(category.id, { over: { price: 40 }, variants: [{ stockQuantity: 100 }] });
  const ordinary = extra ? await makeProduct(category.id, { over: { price: 50 }, variants: [{ stockQuantity: 100 }] }) : null;
  const partner = secondBundle ? await makeProduct(category.id, { over: { price: 20 }, variants: [{ stockQuantity: 100 }] }) : null;
  const bundle = (await request(app).post('/api/bundles').set(bearer(admin.token)).send({ nameEn: 'A + B', nameAr: 'باقة أ وب', price: 80, status: 'ACTIVE',
    components: [{ variantID: a.variants[0].id, quantity: 2 }, { variantID: b.variants[0].id, quantity: 1 }] }).expect(201)).body.bundle;
  if (secondBundle && ordinary && partner) await request(app).post('/api/bundles').set(bearer(admin.token)).send({ nameEn: 'Second recipe', nameAr: 'باقة ثانية', price: 60, status: 'ACTIVE',
    components: [{ variantID: ordinary.variants[0].id, quantity: 1 }, { variantID: partner.variants[0].id, quantity: 1 }] }).expect(201);
  for (const [product, quantity] of [[a, aQty], [b, bQty], ...(ordinary ? [[ordinary, 1] as const] : []), ...(partner ? [[partner, 1] as const] : [])] as const) {
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: product.variants[0].id, quantity }).expect(201);
  }
  const order = (await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send(delivery).expect(201)).body.order;
  for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) await request(app).patch(`/api/admin/orders/${order.id}/status`).set(bearer(admin.token)).send({ status }).expect(200);
  const token = randomUUID();
  await prisma.orderAccessToken.create({ data: { orderID: order.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });
  const lines = Object.fromEntries([[a, 'a'], [b, 'b'], ...(ordinary ? [[ordinary, 'ordinary'] as const] : []), ...(partner ? [[partner, 'partner'] as const] : [])].map(([product, key]) =>
    [key, order.items.find((i: { variantID: string }) => i.variantID === (product as typeof a).variants[0].id)]));
  return { admin, buyer, a, b, ordinary, bundle, order, token, lines };
}
type Purchase = Awaited<ReturnType<typeof purchase>>;
const selection = (p: Purchase, items: Record<string, number>) => ({ items: Object.entries(items).map(([id, quantity]) => ({ orderItemID: p.lines[id].id, quantity })) });
const submit = (p: Purchase, items: Record<string, number>, extra = {}) => request(app).post(`/api/orders/${p.order.id}/returns`).set(bearer(p.buyer.token)).send({ ...selection(p, items), ...extra });
const preview = (p: Purchase, items: Record<string, number>) => request(app).post(`/api/orders/${p.order.id}/returns/preview`).set(bearer(p.buyer.token)).send(selection(p, items));
async function advance(p: Purchase, id: string, marking: Record<string, unknown> = {}, refund = true) {
  for (const status of ['APPROVED', 'IN_TRANSIT', 'RECEIVED', ...(refund ? ['REFUNDED'] : [])]) {
    await request(app).patch(`/api/admin/returns/${id}/status`).set(bearer(p.admin.token)).send({ status,
      ...(status === 'REFUNDED' ? { payout: { payerName: 'Test cashier' }, ...marking } : {}) }).expect(200);
  }
}

describe('Bundle Phase B returns', () => {
  it('rejects a legacy writer that inserts a Bundle return without group evidence', async () => {
    const p = await purchase();
    await expect(prisma.return.create({ data: { orderID: p.order.id, items: { create: {
      orderItemID: p.lines.a.id, quantity: 1, refundAmount: 24,
    } } } })).rejects.toThrow(/calculation evidence is missing/);
    expect(await prisma.return.count()).toBe(0);
  });
  it('preserves ordinary return deletion behavior while bundle evidence remains append-only', async () => {
    const p = await purchase(2, 1, true);
    const ret = (await submit(p, { ordinary: 1 }).expect(201)).body.return;
    await prisma.return.delete({ where: { id: ret.id } });
    expect(await prisma.returnItem.count({ where: { returnID: ret.id } })).toBe(0);
  });
  it('allows independent pending returns from different recipes and claims mixed recipes atomically', async () => {
    const p = await purchase(2, 1, true, false, true);
    await submit(p, { a: 1 }).expect(201);
    expect((await preview(p, { ordinary: 1 }).expect(200)).body.refundCents).toBe(4000);
    await submit(p, { b: 1, ordinary: 1 }).expect(409);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: p.lines.ordinary.id } })).returnedQuantity).toBe(0);
    expect((await submit(p, { ordinary: 1 }).expect(201)).body.return.bundleCalculations).toHaveLength(1);
    expect(await prisma.return.count({ where: { orderID: p.order.id } })).toBe(2);
  });
  it('previews surplus at its paid price without writes and saves the same immutable evidence', async () => {
    const p = await purchase(3); const quote = (await preview(p, { a: 1 }).expect(200)).body;
    expect(quote).toMatchObject({ refundCents: 3000, bundleCalculations: [{ keptInstanceCount: 1, keptNetCents: 8000, lostDiscountCents: 0 }] });
    expect(await prisma.return.count()).toBe(0); expect(await prisma.returnBundleCalculation.count()).toBe(0);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: p.lines.a.id } })).returnedQuantity).toBe(0);
    const ret = (await submit(p, { a: 1 }, { expectedRefundCents: quote.refundCents }).expect(201)).body.return;
    expect(ret.bundleCalculations[0].calculation).toEqual(quote.bundleCalculations[0]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityID: ret.id, action: 'return.refund_calculated' } });
    expect(audit.metadata).toMatchObject({ bundles: quote.bundleCalculations });
    await expect(prisma.returnBundleCalculation.updateMany({ where: { returnID: ret.id }, data: { refundAmount: 1 } })).rejects.toThrow();
    await expect(prisma.returnItem.updateMany({ where: { returnID: ret.id }, data: { refundAmount: 1 } })).rejects.toThrow();
  });
  it('refunds $10, $30, then $40 across a broken recipe, exceeding B’s initial $32 allocation safely', async () => {
    const p = await purchase(); await collectTestOrder(p.order.id, p.admin.user.id);
    expect(Number(p.lines.b.lineTotal)).toBe(32);
    const refunds: number[] = [];
    for (const items of [{ a: 1 }, { a: 1 }, { b: 1 }]) {
      const ret = (await submit(p, items).expect(201)).body.return; refunds.push(Number(ret.refundAmount)); await advance(p, ret.id);
    }
    expect(refunds).toEqual([10, 30, 40]);
    expect(await prisma.refundPayout.count({ where: { orderID: p.order.id } })).toBe(3);
    expect(Number((await prisma.refundPayout.aggregate({ where: { orderID: p.order.id }, _sum: { amount: true } }))._sum.amount)).toBe(80);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.a.variants[0].id } })).stockQuantity).toBe(100);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: p.b.variants[0].id } })).stockQuantity).toBe(100);
  });
  it('preserves purchase-time effective prices after catalog edits and recipe archive', async () => {
    const p = await purchase(2, 1, false, true);
    await prisma.product.update({ where: { id: p.a.id }, data: { price: 500, saleType: null, saleValue: null } });
    await request(app).delete(`/api/bundles/${p.bundle.id}`).set(bearer(p.admin.token)).expect(204);
    const quote = (await preview(p, { a: 1 }).expect(200)).body;
    expect(quote).toMatchObject({ refundCents: 1000, bundleCalculations: [{ keptNetCents: 7000 }] });
    expect(quote.bundleCalculations[0].components).toEqual(expect.arrayContaining([expect.objectContaining({ orderItemID: p.lines.a.id, individualPriceCents: 3000 })]));
  });
  it.each(['customer', 'guest', 'admin'])('covers %s preview and request with group evidence', async via => {
    const p = await purchase(); const path = via === 'guest' ? `/api/orders/track/${p.token}` : via === 'admin' ? `/api/admin/orders/${p.order.id}` : `/api/orders/${p.order.id}`;
    const headers = bearer(via === 'admin' ? p.admin.token : p.buyer.token);
    expect((await request(app).post(`${path}/returns/preview`).set(headers).send(selection(p, { b: 1 })).expect(200)).body.refundCents).toBe(2000);
    expect((await request(app).post(`${path}/returns`).set(headers).send(selection(p, { b: 1 })).expect(201)).body.return.bundleCalculations).toHaveLength(1);
  });
  it.each(['status', 'correction'])('covers whole-order %s return and existing stock/refund separation', async via => {
    const p = await purchase(3, 1, true); await collectTestOrder(p.order.id, p.admin.user.id);
    const res = await request(app).patch(`/api/admin/orders/${p.order.id}/${via}`).set(bearer(p.admin.token)).send({ status: 'RETURNED',
      ...(via === 'correction' ? { expectedStatus: 'DELIVERED', reason: 'Customer returned all items' } : {}) }).expect(200);
    const ret = res.body.order.returns[0]; expect(ret.status).toBe('RECEIVED'); expect(Number(ret.refundAmount)).toBe(160);
    expect(ret.bundleCalculations[0].calculation).toMatchObject({ refundCents: 11000, keptInstanceCount: 0 });
    expect(await prisma.refundPayout.count()).toBe(0);
    await request(app).patch(`/api/admin/returns/${ret.id}/status`).set(bearer(p.admin.token)).send({ status: 'REFUNDED', payout: { payerName: 'Cashier' } }).expect(200);
    expect(await prisma.stockMovement.count({ where: { orderID: p.order.id, type: 'RETURN' } })).toBe(3);
  });
  it('keeps maximum complete instances and supports a mixed group/ordinary request with exact cents', async () => {
    const p = await purchase(4, 2, true); await collectTestOrder(p.order.id, p.admin.user.id);
    const ret = (await submit(p, { a: 1, ordinary: 1 }).expect(201)).body.return;
    expect(Number(ret.refundAmount)).toBe(60); expect(ret.bundleCalculations[0].calculation).toMatchObject({ refundCents: 1000, keptInstanceCount: 1, keptNetCents: 15000 });
    await advance(p, ret.id);
    expect((await preview(p, { b: 1 }).expect(200)).body).toMatchObject({ refundCents: 4000, bundleCalculations: [{ keptInstanceCount: 1, keptNetCents: 11000 }] });
  });
  it('serializes cross-line concurrent claims until RECEIVED is marked refunded, without blocking unrelated lines', async () => {
    const p = await purchase(3, 1, true); await collectTestOrder(p.order.id, p.admin.user.id);
    const responses = await Promise.all([submit(p, { a: 1 }), submit(p, { b: 1 })]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    expect(responses.find(r => r.status === 409)!.body.error.meta.reason).toBe('BUNDLE_RETURN_PENDING');
    const ret = responses.find(r => r.status === 201)!.body.return;
    await preview(p, { ordinary: 1 }).expect(200);
    await advance(p, ret.id, {}, false);
    await preview(p, { a: 1 }).expect(409);
    await request(app).patch(`/api/admin/returns/${ret.id}/status`).set(bearer(p.admin.token)).send({ status: 'REFUNDED', payout: { payerName: 'Cashier' } }).expect(200);
    await preview(p, { a: 1 }).expect(200);
  });
  it.each(['CANCELLED', 'REJECTED'])('%s releases the whole group, retaining audit evidence but no prior entitlement', async status => {
    const p = await purchase(); const ret = (await submit(p, { a: 1 }).expect(201)).body.return;
    await request(app).patch(`/api/admin/returns/${ret.id}/status`).set(bearer(p.admin.token)).send({ status }).expect(200);
    expect((await preview(p, { b: 1 }).expect(200)).body).toMatchObject({ refundCents: 2000, bundleCalculations: [{ previousRefundCents: 0 }] });
    expect(await prisma.returnBundleCalculation.count({ where: { returnID: ret.id } })).toBe(1);
  });
  it.each(['customer', 'guest'])('%s cancellation releases recipe quantities and a stale preview cannot claim another refund', async via => {
    const p = await purchase(3); await collectTestOrder(p.order.id, p.admin.user.id);
    const quote = (await preview(p, { a: 1 }).expect(200)).body;
    const cancelled = (await submit(p, { b: 1 }).expect(201)).body.return;
    await request(app).post(`/api/orders/${via === 'guest' ? `track/${p.token}` : p.order.id}/returns/${cancelled.id}/cancel`).set(bearer(p.buyer.token)).expect(200);
    const first = (await submit(p, { a: 1 }).expect(201)).body.return; await advance(p, first.id);
    await submit(p, { a: 1 }, { expectedRefundCents: quote.refundCents }).expect(409);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: p.lines.a.id } })).returnedQuantity).toBe(1);
  });
  it('preserves calculated history after a lower manual payout and hides misleading explanations for customers', async () => {
    const p = await purchase(); await collectTestOrder(p.order.id, p.admin.user.id);
    const first = (await submit(p, { a: 1 }).expect(201)).body.return;
    await advance(p, first.id, { merchandiseRefundCents: 500, refundAdjustmentReason: 'Agreed adjustment' });
    expect((await preview(p, { a: 1 }).expect(200)).body).toMatchObject({ refundCents: 3000, bundleCalculations: [{ previousRefundCents: 1000 }] });
    const detail = (await request(app).get(`/api/orders/${p.order.id}`).set(bearer(p.buyer.token)).expect(200)).body.order;
    expect(detail.returns[0]).toMatchObject({ refundWasAdjusted: true, bundleCalculations: [] });
    expect(detail.returns[0].refundAdjustmentReason).toBeUndefined();
    const adminList = (await request(app).get('/api/admin/returns').set(bearer(p.admin.token)).expect(200)).body;
    expect(JSON.stringify(adminList)).toContain('BUNDLE_KEPT_QUANTITY');
  });
  it('caps an upward adjusted payout at the group total even when other order money remains', async () => {
    const p = await purchase(2, 1, true); await collectTestOrder(p.order.id, p.admin.user.id);
    const first = (await submit(p, { a: 1 }).expect(201)).body.return;
    await advance(p, first.id, { merchandiseRefundCents: 2000, refundAdjustmentReason: 'Agreed extra refund' });
    const second = (await submit(p, { a: 1 }).expect(201)).body.return; await advance(p, second.id);
    const third = (await submit(p, { b: 1 }).expect(201)).body.return; await advance(p, third.id, {}, false);
    const rejected = await request(app).patch(`/api/admin/returns/${third.id}/status`).set(bearer(p.admin.token)).send({ status: 'REFUNDED', payout: { payerName: 'Cashier' } }).expect(409);
    expect(rejected.body.error.meta.reason).toBe('EXCEEDS_BUNDLE_REFUNDABLE');
    expect((await prisma.return.findUniqueOrThrow({ where: { id: third.id } })).status).toBe('RECEIVED');
    await request(app).patch(`/api/admin/returns/${third.id}/status`).set(bearer(p.admin.token)).send({ status: 'REFUNDED',
      merchandiseRefundCents: 3000, refundAdjustmentReason: 'Respect original Bundle total', payout: { payerName: 'Cashier' } }).expect(200);
  });
  it('still requires collection evidence, respects partial collection and independent refund permission', async () => {
    const p = await purchase(); const marker = await createStaffWith(['refunds:manage']); const receiver = await createStaffWith(['returns:manage']);
    const ret = (await submit(p, { b: 1 }).expect(201)).body.return; await advance(p, ret.id, {}, false);
    const path = `/api/admin/returns/${ret.id}/status`; const body = { status: 'REFUNDED', payout: { payerName: 'Cashier' } };
    await request(app).patch(path).set(bearer(receiver.token)).send(body).expect(403);
    expect((await request(app).patch(path).set(bearer(marker.token)).send(body).expect(409)).body.error.meta.reason).toBe('NO_COLLECTION_RECORDED');
    await recordCollection(p.order.id, { collected: true, amount: 10, currency: 'USD', collectedAt: new Date().toISOString(), collectorName: 'Courier' }, p.admin.user.id);
    expect((await request(app).patch(path).set(bearer(marker.token)).send(body).expect(409)).body.error.meta.reason).toBe('EXCEEDS_REMAINING_REFUNDABLE');
    await request(app).patch(path).set(bearer(marker.token)).send({ ...body, merchandiseRefundCents: 1000, refundAdjustmentReason: 'Collected amount only' }).expect(200);
  });
});
