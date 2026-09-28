import { collectTestOrder } from '../helpers/collection';
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { bearer, createAdmin, createCustomer, createStaffWith } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
const delivery = { deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT' };
async function purchase(quantity = 7, coupon = 0, sale: boolean | number = false, promotion = false) {
  const buyer = await createCustomer();
  const admin = await createAdmin();
  const category = await makeCategory();
  const product = await makeProduct(category.id, { over: { price: 12, ...(sale ? { saleType: 'AMOUNT', saleValue: typeof sale === 'number' ? sale : 3 } : {}) }, variants: [{ stockQuantity: 50 }] });
  if (promotion) await prisma.promotion.create({ data: {
    nameEn: 'Half price', nameAr: 'Half price', status: 'ACTIVE', appliesToAll: true,
    type: 'PERCENT', value: 50, stackable: false,
  } });
  // The design's original worked schedule is intentionally captured as a
  // purchase fixture. New admin saves reject its equal-total 4/5 boundary.
  const rule = await prisma.comboRule.create({ data: { nameEn: 'Purchase bands', nameAr: 'Bands', pricingModel: 'UNIT_RATE_BANDS', status: 'ACTIVE',
    products: { create: { productID: product.id } }, tiers: { create: [{ minQty: 3, maxQty: 4, price: 10 }, { minQty: 5, price: 8 }] } } });
  if (coupon) await prisma.coupon.create({ data: { code: 'REFUND', type: 'AMOUNT', value: coupon } });
  await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: product.variants[0].id, quantity }).expect(201);
  const checkout = await request(app).post('/api/orders/checkout').set(bearer(buyer.token))
    .send({ ...delivery, ...(coupon ? { couponCode: 'REFUND' } : {}) }).expect(201);
  const order = checkout.body.order;
  for (const status of ['CONFIRMED', 'SHIPPED', 'DELIVERED']) await request(app).patch(`/api/admin/orders/${order.id}/status`).set(bearer(admin.token)).send({ status, ...(status === 'REFUNDED' ? { payout: { payerName: 'Test cashier' } } : {}) }).expect(200);
  await collectTestOrder(order.id, admin.user.id);
  return { buyer, admin, product, rule, order, line: order.items[0] };
}
type Purchase = Awaited<ReturnType<typeof purchase>>;
const body = (p: Purchase, quantity: number) => ({ items: [{ orderItemID: p.line.id, quantity }] });
const submit = (p: Purchase, quantity: number) => request(app).post(`/api/orders/${p.order.id}/returns`).set(bearer(p.buyer.token)).send(body(p, quantity));
const preview = (p: Purchase, quantity: number) => request(app).post(`/api/orders/${p.order.id}/returns/preview`).set(bearer(p.buyer.token)).send(body(p, quantity));
async function advance(p: Purchase, id: string, statuses = ['APPROVED', 'IN_TRANSIT', 'RECEIVED', 'REFUNDED']) {
  for (const status of statuses) await request(app).patch(`/api/admin/returns/${id}/status`).set(bearer(p.admin.token)).send({ status, ...(status === 'REFUNDED' ? { payout: { payerName: 'Test cashier' } } : {}) }).expect(200);
}

describe('purchase-time kept-quantity refunds', () => {
  it('preserves calculated refund history when an earlier effective amount was adjusted', async () => {
    const p = await purchase(); const first = (await submit(p, 3).expect(201)).body.return;
    await advance(p, first.id, ['APPROVED', 'IN_TRANSIT', 'RECEIVED']);
    await request(app).patch(`/api/admin/returns/${first.id}/status`).set(bearer(p.admin.token))
      .send({ payout: { payerName: 'Test cashier' }, status: 'REFUNDED', merchandiseRefundCents: 1000, refundAdjustmentReason: 'Restocking fee' }).expect(200);
    const second = (await submit(p, 2).expect(201)).body.return;
    expect(Number(first.refundAmount)).toBe(16);
    expect(Number(second.refundAmount)).toBe(16);
    expect(second.items[0].refundBreakdown.previousRefundCents).toBe(1600);
    expect((await prisma.return.findUniqueOrThrow({ where: { id: first.id } })).refundAmount!.toString()).toBe('16');
  });
  it.each([[3, 16, 4, 4000], [5, 32, 2, 2400]])('previews and approves returning %i of seven', async (qty, refund, kept, keptCents) => {
    const p = await purchase();
    expect(p.line.priceBreakdown).toMatchObject({ version: 2, pricingModel: 'UNIT_RATE_BANDS', rule: { id: p.rule.id }, individualUnitPriceCents: 1200 });
    const quote = await preview(p, qty).expect(200);
    expect(quote.body.refundCents).toBe(refund * 100);
    expect(await prisma.return.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'return.refund_calculated' } })).toBe(0);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: p.line.id } })).returnedQuantity).toBe(0);
    // Change both inputs after purchase, then delete the live rule entirely.
    await prisma.product.update({ where: { id: p.product.id }, data: { price: 100 } });
    await prisma.comboRule.delete({ where: { id: p.rule.id } });
    const ret = await submit(p, qty).expect(201);
    expect(Number(ret.body.return.refundAmount)).toBe(refund);
    expect(ret.body.return.items[0].refundBreakdown).toEqual(quote.body.items[0].refundBreakdown);
    const audit = await prisma.auditLog.findMany({ where: { entityID: ret.body.return.id, action: 'return.refund_calculated' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entityType: 'return', actorID: p.buyer.user.id, metadata: {
      orderID: p.order.id, refundCents: refund * 100,
      items: [{ orderItemID: p.line.id, quantity: qty, ...quote.body.items[0].refundBreakdown }],
    } });
    await advance(p, ret.body.return.id, ['APPROVED']);
    const detail = await request(app).get(`/api/orders/${p.order.id}`).set(bearer(p.buyer.token)).expect(200);
    expect(detail.body.order.returns[0].items[0].refundBreakdown).toMatchObject({ keptQuantity: kept, keptNetCents: keptCents, refundCents: refund * 100 });
  });
  it('deducts issued refunds cumulatively and refunds exactly the original total', async () => {
    const p = await purchase();
    const amounts = [];
    for (const qty of [3, 2, 2]) {
      const ret = await submit(p, qty).expect(201);
      amounts.push(Number(ret.body.return.refundAmount));
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityID: ret.body.return.id, action: 'return.refund_calculated' } });
      expect(audit.metadata).toMatchObject({ items: [{
        ...ret.body.return.items[0].refundBreakdown,
        previousRefundCents: Math.round(amounts.slice(0, -1).reduce((a, b) => a + b, 0) * 100),
      }] });
      await advance(p, ret.body.return.id);
    }
    expect(amounts).toEqual([16, 16, 24]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(Number(p.line.lineTotal));
  });
  it('allows zero refunds at the boundary and preserves purchase-time sales', async () => {
    const p = await purchase(5);
    expect((await submit(p, 1).expect(201)).body.return.refundAmount).toBe('0');
    const sale = await purchase(7, 0, true);
    await prisma.product.update({ where: { id: sale.product.id }, data: { saleType: null, saleValue: null } });
    expect((await preview(sale, 3).expect(200)).body.refundCents).toBe(2000);
  });
  it.each(['sale', 'promotion'])('refunds a partial return at the purchase-time %s price below the volume band', async (kind) => {
    const p = await purchase(7, 0, kind === 'sale' ? 6 : false, kind === 'promotion');
    // The active $6 sale/promotion wins at purchase against the $8 band.
    expect(Number(p.line.unitPrice)).toBe(6);
    expect(Number(p.line.lineTotal)).toBe(42);
    expect(p.line.priceBreakdown).toMatchObject({ individualUnitPriceCents: 600, netLineTotalCents: 4200 });
    // End the discount before the return. Four kept units still cost $6 each,
    // beating their purchase-time $10 band; no live prices are consulted.
    await prisma.product.update({ where: { id: p.product.id }, data: { saleType: null, saleValue: null } });
    await prisma.promotion.updateMany({ data: { status: 'ENDED' } });
    const quote = await preview(p, 3).expect(200);
    expect(quote.body.items[0].refundBreakdown).toMatchObject({
      originalNetCents: 4200, keptQuantity: 4, keptGrossCents: 2400, keptNetCents: 2400,
      previousRefundCents: 0, refundCents: 1800,
    });
    const ret = await submit(p, 3).expect(201);
    expect(Number(ret.body.return.refundAmount)).toBe(18);
    expect(ret.body.return.items[0].refundBreakdown).toEqual(quote.body.items[0].refundBreakdown);
  });
  it('does not lose coupon rounding cents across successive returns', async () => {
    const p = await purchase(7, 0.01);
    let sum = 0;
    for (const qty of [3, 2, 2]) {
      const ret = await submit(p, qty).expect(201);
      sum += Math.round(Number(ret.body.return.refundAmount) * 100);
      await advance(p, ret.body.return.id);
    }
    expect(sum).toBe(5599);
  });
  it.each(['admin', 'guest'])('audits the accepted calculation for a %s return', async (via) => {
    const p = await purchase();
    let ret;
    if (via === 'admin') {
      ret = await request(app).post(`/api/admin/orders/${p.order.id}/returns`).set(bearer(p.admin.token)).send(body(p, 3)).expect(201);
    } else {
      const lookup = await request(app).post('/api/orders/lookup').send({ orderNumber: p.order.orderNumber, contact: delivery.deliveryPhone }).expect(200);
      ret = await request(app).post(`/api/orders/track/${lookup.body.token}/returns`).send(body(p, 3)).expect(201);
    }
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityID: ret.body.return.id, action: 'return.refund_calculated' } });
    expect(audit).toMatchObject({ actorID: via === 'admin' ? p.admin.user.id : null, metadata: {
      orderID: p.order.id, refundCents: 1600,
      items: [{ orderItemID: p.line.id, keptQuantity: 4, keptGrossCents: 4000, keptNetCents: 4000, previousRefundCents: 0, refundCents: 1600 }],
    } });
  });
  it('serializes competing requests until the pending return is resolved, including RECEIVED', async () => {
    const p = await purchase();
    const results = await Promise.all([submit(p, 1), submit(p, 1)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.auditLog.count({ where: { action: 'return.refund_calculated' } })).toBe(1);
    const ret = results.find((r) => r.status === 201)!.body.return;
    await advance(p, ret.id, ['APPROVED', 'IN_TRANSIT', 'RECEIVED']);
    await preview(p, 1).expect(409);
    await submit(p, 1).expect(409);
    await advance(p, ret.id, ['REFUNDED']);
    await submit(p, 1).expect(201);
  });
  it('rejects a stale preview without claiming quantity when an intervening return changes the refund', async () => {
    const p = await purchase();
    const quote = await preview(p, 3).expect(200);
    const ret = await submit(p, 1).expect(201);
    await advance(p, ret.body.return.id);
    await request(app).post(`/api/orders/${p.order.id}/returns`).set(bearer(p.buyer.token))
      .send({ ...body(p, 3), expectedRefundCents: quote.body.refundCents }).expect(409);
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: p.line.id } })).returnedQuantity).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'return.refund_calculated' } })).toBe(1);
    expect((await preview(p, 3).expect(200)).body.refundCents).toBe(1800);
  });
  it.each(['CANCELLED', 'REJECTED'])('%s releases the pending claim without charging a prior refund', async (status) => {
    const p = await purchase();
    const ret = await submit(p, 3).expect(201);
    await advance(p, ret.body.return.id, [status]);
    expect((await preview(p, 3).expect(200)).body.refundCents).toBe(1600);
  });
  it.each([null, { version: 1, beforeCouponLineTotalCents: 500, unitPricesCents: [166, 167, 167] }])('falls back for historical snapshots: %j', async (snapshot) => {
    const p = await purchase(3);
    await prisma.orderItem.update({ where: { id: p.line.id }, data: { unitPrice: 1.67, lineTotal: 5, priceBreakdown: snapshot ?? Prisma.DbNull } });
    expect(Number((await submit(p, 1).expect(201)).body.return.refundAmount)).toBe(1.67);
    expect(Number((await submit(p, 2).expect(201)).body.return.refundAmount)).toBe(3.33);
  });
  it('protects previews by ownership, admin permission and guest token, and rejects duplicate lines', async () => {
    const p = await purchase();
    const outsider = await createCustomer();
    const viewer = await createStaffWith(['orders:view']);
    await request(app).post(`/api/orders/${p.order.id}/returns/preview`).set(bearer(outsider.token)).send(body(p, 3)).expect(404);
    await request(app).post(`/api/admin/orders/${p.order.id}/returns/preview`).set(bearer(viewer.token)).send(body(p, 3)).expect(403);
    expect((await request(app).post(`/api/admin/orders/${p.order.id}/returns/preview`).set(bearer(p.admin.token)).send(body(p, 3)).expect(200)).body.refundCents).toBe(1600);
    const lookup = await request(app).post('/api/orders/lookup').send({ orderNumber: p.order.orderNumber, contact: delivery.deliveryPhone }).expect(200);
    expect((await request(app).post(`/api/orders/track/${lookup.body.token}/returns/preview`).send(body(p, 3)).expect(200)).body.refundCents).toBe(1600);
    await request(app).post(`/api/orders/track/invalid/returns/preview`).send(body(p, 3)).expect(404);
    await request(app).post(`/api/orders/${p.order.id}/returns`).set(bearer(p.buyer.token)).send({ items: [...body(p, 1).items, ...body(p, 1).items] }).expect(400);
  });
});
