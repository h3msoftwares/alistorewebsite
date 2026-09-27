import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, createStaffWith, bearer } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';
import { activeComboRules } from '../../src/modules/combos/combo-rule.service';

const app = buildApp();
let adminToken: string;
let product: Awaited<ReturnType<typeof makeProduct>>;
beforeEach(async () => {
  adminToken = (await createAdmin()).token;
  const cat = await makeCategory();
  product = await makeProduct(cat.id, { over: { price: 12 }, variants: [
    { sku: 'SMALL', size: 'S', stockQuantity: 1000 }, { sku: 'LARGE', size: 'L', stockQuantity: 1000 },
  ] });
});
const post = (body: unknown) => request(app).post('/api/combo-rules').set(bearer(adminToken)).send(body);
const patch = (id: string, body: unknown) => request(app).patch('/api/combo-rules/' + id).set(bearer(adminToken)).send(body);
const body = () => ({ nameEn: 'Volume', nameAr: 'Volume', status: 'ACTIVE', productIds: [product.id],
  tiers: [{ minQty: 3, price: 10 }, { minQty: 5, price: 8.1 }] });
const delivery = { deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street',
  deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT' };

describe('volume pricing API', () => {
  it('requires combos:manage for writes and combos:view for reads', async () => {
    const viewer = await createStaffWith(['combos:view']);
    const manager = await createStaffWith(['combos:manage']);
    expect((await request(app).get('/api/combo-rules')).status).toBe(401);
    expect((await request(app).get('/api/combo-rules').set(bearer(viewer.token))).status).toBe(200);
    expect((await request(app).post('/api/combo-rules').set(bearer(viewer.token)).send(body())).status).toBe(403);
    expect((await request(app).post('/api/combo-rules').set(bearer(manager.token)).send(body())).status).toBe(201);
  });
  it('derives stored bounds and creates only new rate-band rules', async () => {
    const res = await post({ ...body(), tiers: [...body().tiers].reverse() });
    expect(res.status).toBe(201);
    expect(res.body.comboRule.pricingModel).toBe('UNIT_RATE_BANDS');
    expect(res.body.comboRule.tiers).toMatchObject([
      { minQty: 3, maxQty: 4, price: '10' }, { minQty: 5, maxQty: null, price: '8.1' },
    ]);
    const updated = await patch(res.body.comboRule.id, { tiers: [{ minQty: 3, price: 10 }, { minQty: 6, price: 8.5 }] });
    expect(updated.status).toBe(200);
    expect(updated.body.comboRule.tiers).toMatchObject([{ minQty: 3, maxQty: 5 }, { minQty: 6, maxQty: null }]);
  });
  it.each([8, 7.9])('rejects a non-increasing total at rate %s and reports the actual boundary amounts', async (rate) => {
    const res = await post({ ...body(), tiers: [{ minQty: 3, price: 10 }, { minQty: 5, price: rate }] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('4 × $10.00 = $40.00');
    expect(res.body.error.message).toContain('5 × $' + rate.toFixed(2));
    expect(res.body.error.meta.boundaries.some((b: { valid: boolean }) => !b.valid)).toBe(true);
    expect(await prisma.comboRule.count({ where: { products: { some: { productID: product.id } } } })).toBe(0);
  });
  it('validates the first threshold against every variant and rechecks partial updates', async () => {
    expect((await post({ ...body(), tiers: [{ minQty: 3, price: 5 }] })).status).toBe(400);
    const created = await post(body());
    await prisma.productVariant.update({ where: { id: product.variants[1].id }, data: { price: 25 } });
    const res = await patch(created.body.comboRule.id, { priority: 2 });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('LARGE: 2 × $25.00 = $50.00');
  });
  it('rejects all broad scopes, multiple products, editable maxima, duplicate minima and fractional cents', async () => {
    const cases = [
      { productIds: [] }, { productIds: [product.id, product.id] }, { appliesToAll: true },
      { categoryTargets: [{ categoryId: product.primaryCategoryID, includeDescendants: true }] },
      { collectionIds: [product.id] },
      { tiers: [{ minQty: 3, maxQty: 5, price: 10 }] },
      { tiers: [{ minQty: 3, price: 10 }, { minQty: 3, price: 9 }] },
      { tiers: [{ minQty: 3, price: 10.001 }] },
    ];
    for (const over of cases) expect((await post({ ...body(), ...over })).status).toBe(400);
  });
  it('preserves legacy flat-price drafts, refuses conversion/activation, and excludes them from pricing', async () => {
    const legacy = await prisma.comboRule.create({ data: {
      nameEn: 'Loyalty', nameAr: 'Loyalty', status: 'DRAFT',
      tiers: { create: { minQty: 5, maxQty: null, price: 7 } },
      products: { create: { productID: product.id } },
    }, include: { tiers: true } });
    expect((await patch(legacy.id, { status: 'ACTIVE' })).status).toBe(400);
    expect(await prisma.comboRule.findUnique({ where: { id: legacy.id }, include: { tiers: true } })).toEqual(legacy);
    // Even an old ACTIVE row cannot reach the new pricing engine.
    await prisma.comboRule.update({ where: { id: legacy.id }, data: { status: 'ACTIVE' } });
    expect(await activeComboRules()).toEqual([]);
  });
  it('excludes unsupported stored targeting even if inserted outside the validated API', async () => {
    const created = await post(body());
    await prisma.comboRuleCategory.create({ data: { comboRuleID: created.body.comboRule.id, categoryID: product.primaryCategoryID } });
    expect(await activeComboRules()).toEqual([]);
  });
  it('records create/update/delete audit events without changing scope', async () => {
    const created = await post(body());
    const id = created.body.comboRule.id;
    expect((await patch(id, { priority: 7 })).status).toBe(200);
    await request(app).delete('/api/combo-rules/' + id).set(bearer(adminToken)).expect(204);
    expect((await prisma.auditLog.findMany({ where: { entityID: id }, orderBy: { createdAt: 'asc' } })).map((log) => log.action))
      .toEqual(['comboRule.created', 'comboRule.updated', 'comboRule.deleted']);
  });
});

describe('volume pricing in existing carts and checkout', () => {
  it('counts each variant separately and preserves coupon allocation at checkout', async () => {
    await post(body()).expect(201);
    await prisma.coupon.create({ data: { code: 'TEN', type: 'PERCENT', value: 10 } });
    const buyer = await createCustomer();
    for (const [i, quantity] of [4, 2].entries()) {
      await request(app).post('/api/cart/items').set(bearer(buyer.token))
        .send({ variantId: product.variants[i].id, quantity }).expect(201);
    }
    const cart = await request(app).get('/api/cart').set(bearer(buyer.token)).expect(200);
    expect(cart.body.subtotal).toBe(64); // 4 * $10 + 2 * $12; never 6 * $8.10
    const checkout = await request(app).post('/api/orders/checkout').set(bearer(buyer.token))
      .send({ ...delivery, expectedSubtotal: 64, couponCode: 'TEN' }).expect(201);
    expect(Number(checkout.body.order.subtotal)).toBe(64);
    expect(Number(checkout.body.order.total)).toBe(57.6);
    const lines = checkout.body.order.items;
    expect(Number(lines.find((i: { quantity: number }) => i.quantity === 4).lineTotal)).toBe(36);
    expect(Number(lines.find((i: { quantity: number }) => i.quantity === 2).lineTotal)).toBe(21.6);
  });
  it('scales beyond the old 300-unit cutoff', async () => {
    await post(body()).expect(201);
    const buyer = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: product.variants[0].id, quantity: 350 }).expect(201);
    expect((await request(app).get('/api/cart').set(bearer(buyer.token))).body.subtotal).toBe(2835);
    const checkout = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send({ ...delivery, expectedSubtotal: 2835 }).expect(201);
    expect(Number(checkout.body.order.items[0].lineTotal)).toBe(2835);
  });
  it('lets a cheaper existing promotion win without stacking the volume rate', async () => {
    await post(body()).expect(201);
    await prisma.promotion.create({ data: { nameEn: 'Half', nameAr: 'Half', status: 'ACTIVE',
      appliesToAll: true, type: 'PERCENT', value: 50, stackable: true } });
    const buyer = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: product.variants[0].id, quantity: 7 });
    expect((await request(app).get('/api/cart').set(bearer(buyer.token))).body.subtotal).toBe(42);
  });
  it('reprices existing carts after pausing and rejects a stale checkout subtotal', async () => {
    const created = await post(body());
    const buyer = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: product.variants[0].id, quantity: 4 });
    expect((await request(app).get('/api/cart').set(bearer(buyer.token))).body.subtotal).toBe(40);
    await patch(created.body.comboRule.id, { status: 'PAUSED' }).expect(200);
    expect((await request(app).get('/api/cart').set(bearer(buyer.token))).body.subtotal).toBe(48);
    const stale = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send({ ...delivery, expectedSubtotal: 40 }).expect(409);
    expect(stale.body.error.meta.reason).toBe('PRICE_CHANGED');
  });
});
