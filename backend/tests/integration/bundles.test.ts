import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { bearer, createAdmin, createCustomer, createStaffWith } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';
import { effectivePermissions } from '../../src/lib/permissions';

const app = buildApp();
const delivery = { deliveryName: 'Buyer', deliveryPhone: '0791234567', deliveryAddress: 'Street', deliveryCity: 'Beirut', deliveryRegion: 'BEIRUT' };
let admin: Awaited<ReturnType<typeof createAdmin>>;
let buyer: Awaited<ReturnType<typeof createCustomer>>;
let a: Awaited<ReturnType<typeof makeProduct>>;
let b: typeof a;
beforeEach(async () => {
  admin = await createAdmin(); buyer = await createCustomer();
  const category = await makeCategory();
  a = await makeProduct(category.id, { over: { price: 30 }, variants: [{ stockQuantity: 1000 }] });
  b = await makeProduct(category.id, { over: { price: 40 }, variants: [{ stockQuantity: 1000 }] });
});
const body = () => ({ nameEn: 'Bundle', nameAr: 'باقة', status: 'ACTIVE', price: 80, components: [{ variantID: a.variants[0].id, quantity: 2 }, { variantID: b.variants[0].id, quantity: 1 }] });
const post = (data = body()) => request(app).post('/api/bundles').set(bearer(admin.token)).send(data);
async function fillCart(aQty = 2, bQty = 1) {
  for (const [product, quantity] of [[a, aQty], [b, bQty]] as const) {
    if (quantity) await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: product.variants[0].id, quantity }).expect(201);
  }
}
const checkout = (extra = {}) => request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send({ ...delivery, ...extra });

describe('Bundle Phase A', () => {
  it('enforces view/manage separately; ADMIN has all, revoked keys and existing staff roles remain respected', async () => {
    const viewer = await createStaffWith(['bundles:view']); const manager = await createStaffWith(['bundles:manage']); const old = await createStaffWith(['combos:manage']);
    expect((await request(app).get('/api/bundles')).status).toBe(401);
    expect((await request(app).get('/api/bundles').set(bearer(viewer.token))).status).toBe(200);
    expect((await request(app).post('/api/bundles').set(bearer(viewer.token)).send(body())).status).toBe(403);
    expect((await request(app).post('/api/bundles').set(bearer(old.token)).send(body())).status).toBe(403);
    const created = await request(app).post('/api/bundles').set(bearer(manager.token)).send(body()).expect(201);
    expect((await request(app).patch(`/api/bundles/${created.body.bundle.id}`).set(bearer(viewer.token)).send({ nameEn: 'Denied' })).status).toBe(403);
    expect((await request(app).delete(`/api/bundles/${created.body.bundle.id}`).set(bearer(viewer.token))).status).toBe(403);
    expect(effectivePermissions({ role: 'ADMIN' }).has('bundles:manage')).toBe(true);
    expect(effectivePermissions({ role: 'STAFF', rolePermissions: ['bundles:manage'] }).has('bundles:view')).toBe(true);
    await prisma.user.update({ where: { id: admin.user.id }, data: { revokedPermissions: ['bundles:manage'] } });
    expect((await post({ ...body(), status: 'DRAFT' })).status).toBe(403);
  });
  it.each([70, 69.99, 100, 101])('rejects unsafe or non-saving flat price %s', async (price) => {
    const res = await post({ ...body(), price }); expect(res.status).toBe(400); expect(res.body.error.message).toContain('above $70.00 and below $100.00');
  });
  it('rejects duplicate, missing, inactive SKUs, fractional quantities, invalid cents and date windows', async () => {
    const original = body();
    for (const invalid of [
      { ...original, components: [original.components[0]] },
      { ...original, components: [original.components[0], original.components[0]] },
      { ...original, components: [original.components[0], { variantID: randomUUID(), quantity: 1 }] },
      { ...original, components: [{ ...original.components[0], quantity: 1.5 }, original.components[1]] },
      { ...original, price: 80.001 },
      { ...original, startsAt: '2027-02-02T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' },
    ]) expect((await post(invalid)).status).toBe(400);
    await prisma.product.update({ where: { id: b.id }, data: { isActive: false } });
    expect((await post()).status).toBe(400);
  });
  it('checks current effective price bounds at save and again at runtime', async () => {
    await prisma.product.update({ where: { id: a.id }, data: { saleType: 'AMOUNT', saleValue: 20 } });
    expect((await post()).status).toBe(400);
    await prisma.product.update({ where: { id: a.id }, data: { saleType: null, saleValue: null } });
    await post().expect(201); await fillCart();
    await prisma.product.update({ where: { id: a.id }, data: { saleType: 'AMOUNT', saleValue: 20 } });
    const cart = await request(app).get('/api/cart').set(bearer(buyer.token)).expect(200);
    expect(cart.body.subtotal).toBe(60); expect(cart.body.bundles).toEqual([]);
  });
  it('serializes concurrent overlap checks, permits adjacent windows and rejects activation conflicts', async () => {
    const responses = await Promise.all([post(), post()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const active = responses.find((r) => r.status === 201)!.body.bundle;
    await request(app).patch(`/api/bundles/${active.id}`).set(bearer(admin.token)).send({ startsAt: '2027-01-01T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' }).expect(200);
    await post({ ...body(), startsAt: '2027-02-01T00:00:00Z', endsAt: '2027-03-01T00:00:00Z' } as ReturnType<typeof body>).expect(201);
    const draft = await post({ ...body(), status: 'DRAFT' }).expect(201);
    await request(app).patch(`/api/bundles/${draft.body.bundle.id}`).set(bearer(admin.token)).send({ status: 'ACTIVE' }).expect(409);
  });
  it('uses the same prices in cart, preview and checkout; saves immutable, exact purchase allocations', async () => {
    const created = await post().expect(201); await fillCart(3, 1);
    const cart = await request(app).get('/api/cart').set(bearer(buyer.token)).expect(200);
    const quote = await request(app).get('/api/orders/delivery-quote?region=BEIRUT').set(bearer(buyer.token)).expect(200);
    expect(cart.body.subtotal).toBe(110); expect(quote.body.subtotal).toBe(110); expect(quote.body.options.coupon.subtotal).toBe(130);
    expect(cart.body.items.map((i: { ordinaryLineTotal: number; individualUnitPriceCents: number }) =>
      [i.ordinaryLineTotal, i.individualUnitPriceCents]).sort((x: number[], y: number[]) => x[0] - y[0])).toEqual([[40, 4000], [90, 3000]]);
    expect(quote.body.options.bundle).toMatchObject({ displaySubtotal: 130, bundleDiscountAmount: 20, subtotal: 110 });
    expect(quote.body.options.bundle.items.map((i: { displayLineTotal: number }) => i.displayLineTotal).sort((x: number, y: number) => x - y)).toEqual([40, 90]);
    const paid = await checkout({ pricingMode: 'BUNDLE', expectedSubtotal: 110, expectedTotal: 110 }).expect(201);
    const order = paid.body.order;
    expect(order.total).toBe('110'); expect(order.items.every((i: { priceBreakdown: { version: number } }) => i.priceBreakdown.version === 3)).toBe(true);
    const snapshot = await prisma.orderBundle.findFirstOrThrow({ where: { orderID: order.id }, include: { components: true } });
    expect(snapshot.instanceCount).toBe(1); expect(snapshot.components.map((c) => c.bundledQuantity).sort()).toEqual([1, 2]);
    await request(app).patch(`/api/bundles/${created.body.bundle.id}`).set(bearer(admin.token)).send({ nameEn: 'Edited', price: 81 }).expect(200);
    expect(Number((await prisma.orderBundle.findUniqueOrThrow({ where: { id: snapshot.id } })).flatPrice)).toBe(80);
    await expect(prisma.orderBundle.update({ where: { id: snapshot.id }, data: { flatPrice: 81 } })).rejects.toThrow();
    await expect(prisma.orderItem.update({ where: { id: snapshot.components[0].orderItemID }, data: { lineTotal: 1 } })).rejects.toThrow();
    await expect(prisma.orderBundleComponent.update({ where: { orderBundleID_orderItemID: { orderBundleID: snapshot.id, orderItemID: snapshot.components[0].orderItemID } }, data: { individualPrice: 1 } })).rejects.toThrow();
    await request(app).delete(`/api/bundles/${created.body.bundle.id}`).set(bearer(admin.token)).expect(204);
    expect(await prisma.orderBundle.count({ where: { orderID: order.id } })).toBe(1);
    expect((await request(app).get('/api/bundles').set(bearer(admin.token))).body.bundles).toEqual([]);
  });
  it('shows exclusive coupon/bundle totals and recalculates the selected checkout plan', async () => {
    await post().expect(201); await fillCart();
    await prisma.coupon.create({ data: { code: 'SAVE10', type: 'AMOUNT', value: 10, maxRedemptions: null, maxPerCustomer: null } });
    const quote = await request(app).get('/api/orders/delivery-quote?region=BEIRUT&couponCode=SAVE10&pricingMode=COUPON').set(bearer(buyer.token)).expect(200);
    expect(quote.body.options.bundle).toMatchObject({ subtotal: 80, discountAmount: 0, total: 80 });
    expect(quote.body.options.coupon).toMatchObject({ subtotal: 100, discountAmount: 10, total: 90 });
    expect(quote.body.total).toBe(90);
    await checkout({ couponCode: 'SAVE10', pricingMode: 'BUNDLE' }).expect(400);
    await checkout({ pricingMode: 'COUPON', couponCode: 'SAVE10', expectedSubtotal: 80 }).expect(409);
    const paid = await checkout({ pricingMode: 'COUPON', couponCode: 'SAVE10', expectedSubtotal: 100, expectedTotal: 90 }).expect(201);
    expect(paid.body.order.total).toBe('90');
    expect(await prisma.orderBundle.count({ where: { orderID: paid.body.order.id } })).toBe(0);
    expect(paid.body.order.items.every((i: { priceBreakdown: { version: number } }) => i.priceBreakdown.version === 2)).toBe(true);
  });
  it('rejects changed prices and discounts using the preview confirmation', async () => {
    await post().expect(201); await fillCart();
    await checkout({ expectedSubtotal: 80, expectedTotal: 79 }).expect(409);
    expect(await prisma.order.count()).toBe(0);
  });
  it('protects recipe SKUs during catalog deletion and releases unpurchased recipes on archive', async () => {
    const spare = await prisma.productVariant.create({ data: { productID: a.id, sku: randomUUID(), stockQuantity: 10 } });
    const created = await post().expect(201);
    await request(app).delete(`/api/products/${a.id}/variants/${a.variants[0].id}`).set(bearer(admin.token)).expect(409);
    await request(app).put(`/api/products/${a.id}/variants`).set(bearer(admin.token)).send({ variants: [{ id: spare.id, sku: spare.sku, stockQuantity: 10 }] }).expect(409);
    await request(app).delete(`/api/products/${a.id}`).set(bearer(admin.token)).expect(204);
    await request(app).delete(`/api/products/${a.id}/permanent`).set(bearer(admin.token)).expect(409);
    await request(app).delete(`/api/bundles/${created.body.bundle.id}`).set(bearer(admin.token)).expect(204);
    expect(await prisma.bundleComponent.count({ where: { bundleID: created.body.bundle.id } })).toBe(0);
    await request(app).delete(`/api/products/${a.id}/permanent`).set(bearer(admin.token)).expect(204);
  });
  it('allows ordinary-item return previews in orders containing a Bundle', async () => {
    await post().expect(201); await fillCart();
    const c = await makeProduct(a.primaryCategoryID, { over: { price: 5 } });
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: c.variants[0].id, quantity: 1 }).expect(201);
    const paid = await checkout().expect(201); const order = paid.body.order;
    await prisma.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
    const token = randomUUID();
    await prisma.orderAccessToken.create({ data: { orderID: order.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 86400000) } });
    const item = order.items.find((i: { variantID: string }) => i.variantID === c.variants[0].id);
    const claim = { items: [{ orderItemID: item.id, quantity: 1 }] };
    for (const path of [`/api/orders/${order.id}/returns/preview`, `/api/orders/track/${token}/returns/preview`, `/api/admin/orders/${order.id}/returns/preview`]) {
      const res = await request(app).post(path).set(bearer(path.includes('/admin/') ? admin.token : buyer.token)).send(claim);
      expect(res.status).toBe(200); expect(res.body.refundCents).toBe(500); expect(res.body.bundleCalculations).toEqual([]);
    }
    expect(await prisma.return.count()).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');
    expect((await prisma.orderItem.findUniqueOrThrow({ where: { id: item.id } })).returnedQuantity).toBe(0);
  });
});
