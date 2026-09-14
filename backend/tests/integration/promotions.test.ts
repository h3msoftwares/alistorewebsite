import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let adminToken: string;

beforeEach(async () => {
  adminToken = (await createAdmin()).token;
});

const patchAdmin = (path: string, body: unknown) =>
  request(app).patch(path).set(bearer(adminToken)).send(body);
const postAdmin = (path: string, body: unknown) =>
  request(app).post(path).set(bearer(adminToken)).send(body);

describe('Promotions API', () => {
  it('requires staff/admin for every write', async () => {
    const customer = (await createCustomer()).token;
    expect((await request(app).get('/api/promotions')).status).toBe(401);
    expect((await request(app).get('/api/promotions').set(bearer(customer))).status).toBe(403);
    expect(
      (await request(app).post('/api/promotions').set(bearer(customer)).send({})).status
    ).toBe(403);
  });

  it('creates a promotion targeting a product / category (with includeDescendants) / collection / site-wide, and rejects bad shapes', async () => {
    const product = await makeProduct((await makeCategory()).id);
    const col = await makeCollection({ slug: 'promo-col' });
    const cat = await makeCategory({ slug: 'promo-cat' });

    const byProduct = await postAdmin('/api/promotions', {
      nameEn: 'By product', nameAr: 'منتج', status: 'ACTIVE', type: 'PERCENT', value: 15,
      productIds: [product.id],
    });
    expect(byProduct.status).toBe(201);
    expect(byProduct.body.promotion.products.map((p: { productID: string }) => p.productID)).toEqual([product.id]);

    const byCategory = await postAdmin('/api/promotions', {
      nameEn: 'By category', nameAr: 'فئة', status: 'ACTIVE', type: 'PERCENT', value: 20,
      categoryTargets: [{ categoryId: cat.id, includeDescendants: true }],
    });
    expect(byCategory.status).toBe(201);
    expect(byCategory.body.promotion.categories).toMatchObject([{ categoryID: cat.id, includeDescendants: true }]);

    const byCollection = await postAdmin('/api/promotions', {
      nameEn: 'By collection', nameAr: 'مجموعة', status: 'ACTIVE', type: 'AMOUNT', value: 5,
      collectionIds: [col.id],
    });
    expect(byCollection.status).toBe(201);
    expect(byCollection.body.promotion.collections).toMatchObject([{ collectionID: col.id }]);

    const siteWide = await postAdmin('/api/promotions', {
      nameEn: 'Site-wide', nameAr: 'على الكل', status: 'ACTIVE', type: 'PERCENT', value: 10, appliesToAll: true,
    });
    expect(siteWide.status).toBe(201);
    expect(siteWide.body.promotion.appliesToAll).toBe(true);

    // percentage over 100
    expect(
      (await postAdmin('/api/promotions', { nameEn: 'x', nameAr: 'x', type: 'PERCENT', value: 150, appliesToAll: true }))
        .status
    ).toBe(400);
    // no target at all, and not appliesToAll
    expect(
      (await postAdmin('/api/promotions', { nameEn: 'x', nameAr: 'x', type: 'PERCENT', value: 10 })).status
    ).toBe(400);
    // appliesToAll AND specific targets together
    expect(
      (await postAdmin('/api/promotions', {
        nameEn: 'x', nameAr: 'x', type: 'PERCENT', value: 10, appliesToAll: true, productIds: [product.id],
      })).status
    ).toBe(400);
    // unknown product id
    expect(
      (await postAdmin('/api/promotions', {
        nameEn: 'x', nameAr: 'x', type: 'PERCENT', value: 10,
        productIds: ['00000000-0000-4000-8000-000000000000'],
      })).status
    ).toBe(404);
    // endsAt before startsAt
    expect(
      (await postAdmin('/api/promotions', {
        nameEn: 'x', nameAr: 'x', type: 'PERCENT', value: 10, appliesToAll: true,
        startsAt: new Date().toISOString(), endsAt: new Date(Date.now() - 86_400_000).toISOString(),
      })).status
    ).toBe(400);
  });

  it('applies to product pricing: stackable=true compounds, stackable=false replaces the product sale', async () => {
    const cat = await makeCategory({ slug: 'p-cat' });
    const product = await makeProduct(cat.id, {
      over: { price: 100, saleType: 'PERCENT', saleValue: 20 }, // own sale → 80
      variants: [{ sku: 'pv1', stockQuantity: 5 }],
    });

    // No promotion yet: effectivePrice is just the product sale.
    let res = await request(app).get(`/api/products/${product.id}`);
    expect(res.body.product.effectivePrice).toBe(80);

    // stackable=true: 10% off the reduced price → 72.
    const promo = await postAdmin('/api/promotions', {
      nameEn: 'Stack', nameAr: 's', status: 'ACTIVE', type: 'PERCENT', value: 10, stackable: true,
      categoryTargets: [{ categoryId: cat.id, includeDescendants: false }],
    });
    res = await request(app).get(`/api/products/${product.id}`);
    expect(res.body.product.effectivePrice).toBe(72);
    expect(res.body.product.onSale).toBe(true);
    expect(res.body.product.promotion).toMatchObject({ type: 'PERCENT', value: 10, stackable: true });

    // stackable=false: 10% off the ORIGINAL price → 90 (product's 20% ignored).
    await patchAdmin(`/api/promotions/${promo.body.promotion.id}`, { stackable: false });
    res = await request(app).get(`/api/products/${product.id}`);
    expect(res.body.product.effectivePrice).toBe(90);
  });

  // The design this session confirmed explicitly, replacing the old
  // Discount model's implicit "most specific scope wins, even at a worse
  // price" default — see lib/pricing.ts pickPromotion(). A lower-priority
  // promotion that targets this product much more specifically must NOT win
  // over a higher-priority, less specific one.
  it('single winner by priority — the highest-priority match wins outright, never the more specific one', async () => {
    const cat = await makeCategory({ slug: 'prio-cat' });
    const product = await makeProduct(cat.id, {
      over: { price: 100 },
      variants: [{ sku: 'priov1', stockQuantity: 5 }],
    });

    // Targets this exact product directly (maximally specific) but LOW priority.
    await postAdmin('/api/promotions', {
      nameEn: 'Specific but low priority', nameAr: 'محدد', status: 'ACTIVE', type: 'PERCENT', value: 50, priority: 1,
      productIds: [product.id],
    });
    // Site-wide (maximally broad) but HIGH priority.
    await postAdmin('/api/promotions', {
      nameEn: 'Broad but high priority', nameAr: 'عام', status: 'ACTIVE', type: 'PERCENT', value: 5, priority: 100,
      appliesToAll: true,
    });

    const res = await request(app).get(`/api/products/${product.id}`);
    // The high-priority 5% wins, NOT the more specific 50% — proves priority
    // alone decides, with no implicit specificity tiebreak.
    expect(res.body.product.effectivePrice).toBe(95);
  });

  it('a CATEGORY target with includeDescendants covers a descendant category; includeDescendants:false does not', async () => {
    const parent = await makeCategory({ slug: 'desc-parent' });
    const child = await makeCategory({ slug: 'desc-child', parentID: parent.id });
    const inChild = await makeProduct(child.id, { over: { price: 100 }, variants: [{ sku: 'dc1', stockQuantity: 5 }] });

    await postAdmin('/api/promotions', {
      nameEn: 'Descendants', nameAr: 'فروع', status: 'ACTIVE', type: 'PERCENT', value: 20,
      categoryTargets: [{ categoryId: parent.id, includeDescendants: true }],
    });
    const withDescendants = await request(app).get(`/api/products/${inChild.id}`);
    expect(withDescendants.body.product.effectivePrice).toBe(80);

    // A second promotion, exact-match only, targeting the same parent — must
    // NOT cover the child.
    const inChild2 = await makeProduct(child.id, { over: { price: 100 }, variants: [{ sku: 'dc2', stockQuantity: 5 }] });
    await postAdmin('/api/promotions', {
      nameEn: 'Exact only', nameAr: 'دقيق', status: 'ACTIVE', type: 'PERCENT', value: 99, priority: 999,
      categoryTargets: [{ categoryId: parent.id, includeDescendants: false }],
    });
    const exactOnlyRes = await request(app).get(`/api/products/${inChild2.id}`);
    // Still only the 20% "with descendants" promotion applies (80), not the
    // higher-priority 99% exact-only one, which doesn't cover this category.
    expect(exactOnlyRes.body.product.effectivePrice).toBe(80);
  });

  it('a COLLECTION target applies via manual CollectionProduct membership, not any category relationship', async () => {
    const col = await makeCollection({ slug: 'sale-col' });
    const cat = await makeCategory({ slug: 'col-scope-cat' });
    const inCollection = await makeProduct(cat.id, {
      over: { price: 100 },
      variants: [{ sku: 'cs1', stockQuantity: 5 }],
      collectionIds: [col.id],
    });
    const sameCategoryNotInCollection = await makeProduct(cat.id, {
      over: { price: 100 },
      variants: [{ sku: 'cs2', stockQuantity: 5 }],
    });

    await postAdmin('/api/promotions', {
      nameEn: 'Collection sale', nameAr: 'تخفيض', status: 'ACTIVE', type: 'PERCENT', value: 20,
      collectionIds: [col.id],
    });

    const inColRes = await request(app).get(`/api/products/${inCollection.id}`);
    expect(inColRes.body.product.effectivePrice).toBe(80);
    expect(inColRes.body.product.promotion).toMatchObject({ type: 'PERCENT', value: 20 });

    // Same category, but NOT manually placed in the collection — unaffected.
    const notInColRes = await request(app).get(`/api/products/${sameCategoryNotInCollection.id}`);
    expect(notInColRes.body.product.effectivePrice).toBe(100);
    expect(notInColRes.body.product.onSale).toBe(false);
  });

  // Regression: a COLLECTION target used to only ever match a product
  // through a manual CollectionProduct row — correct for MANUAL, but an
  // AUTOMATED collection's real membership is computed from CollectionRule
  // and never stored as a join row, so a promotion targeting one silently
  // never matched anything, no matter how correctly everything else (status,
  // window, priority) was configured. Found live: a user-created AUTOMATED
  // collection + a promotion correctly targeting it showed no effect at all
  // on the storefront.
  it('a COLLECTION target resolves an AUTOMATED collection\'s rule-based membership, not just manual rows', async () => {
    const cat = await makeCategory({ slug: 'auto-col-cat' });
    const matchesRule = await makeProduct(cat.id, {
      over: { price: 100 },
      variants: [{ sku: 'acr1', stockQuantity: 5 }],
    });
    const doesNotMatchRule = await makeProduct(cat.id, {
      over: { price: 10 },
      variants: [{ sku: 'acr2', stockQuantity: 5 }],
    });
    const automated = await makeCollection({ slug: 'auto-col', type: 'AUTOMATED' });
    await request(app)
      .put(`/api/collections/${automated.id}/rules`)
      .set(bearer(adminToken))
      .send({ rules: [{ groupNumber: 0, field: 'PRICE', operator: 'GREATER_THAN_OR_EQUAL', value: 50 }] });

    await postAdmin('/api/promotions', {
      nameEn: 'Auto collection sale', nameAr: 'تخفيض آلي', status: 'ACTIVE', type: 'PERCENT', value: 20,
      collectionIds: [automated.id],
    });

    const matchRes = await request(app).get(`/api/products/${matchesRule.id}`);
    expect(matchRes.body.product.effectivePrice).toBe(80);
    expect(matchRes.body.product.promotion).toMatchObject({ type: 'PERCENT', value: 20 });

    // Priced at 10 — fails the collection's own PRICE >= 50 rule, so it was
    // never a member of the collection in the first place.
    const noMatchRes = await request(app).get(`/api/products/${doesNotMatchRule.id}`);
    expect(noMatchRes.body.product.effectivePrice).toBe(10);
    expect(noMatchRes.body.product.onSale).toBe(false);
  });

  it('appliesToAll covers every product, regardless of category/collection', async () => {
    const cat = await makeCategory({ slug: 'all-cat' });
    const product = await makeProduct(cat.id, { over: { price: 100 }, variants: [{ sku: 'allv1', stockQuantity: 5 }] });

    await postAdmin('/api/promotions', {
      nameEn: 'Everything', nameAr: 'الكل', status: 'ACTIVE', type: 'PERCENT', value: 10, appliesToAll: true,
    });

    const res = await request(app).get(`/api/products/${product.id}`);
    expect(res.body.product.effectivePrice).toBe(90);
  });

  it('a DRAFT/PAUSED/ENDED status or an out-of-window promotion does not apply', async () => {
    const cat = await makeCategory({ slug: 'w-cat' });
    const product = await makeProduct(cat.id, {
      over: { price: 100 },
      variants: [{ sku: 'wv1', stockQuantity: 5 }],
    });
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await postAdmin('/api/promotions', {
      nameEn: 'expired', nameAr: 'e', status: 'ACTIVE', type: 'PERCENT', value: 50, endsAt: past,
      categoryTargets: [{ categoryId: cat.id, includeDescendants: false }],
    });
    await postAdmin('/api/promotions', {
      nameEn: 'draft', nameAr: 'د', status: 'DRAFT', type: 'PERCENT', value: 50,
      categoryTargets: [{ categoryId: cat.id, includeDescendants: false }],
    });
    await postAdmin('/api/promotions', {
      nameEn: 'paused', nameAr: 'م', status: 'PAUSED', type: 'PERCENT', value: 50,
      categoryTargets: [{ categoryId: cat.id, includeDescendants: false }],
    });
    const res = await request(app).get(`/api/products/${product.id}`);
    expect(res.body.product.effectivePrice).toBe(100);
    expect(res.body.product.onSale).toBe(false);
  });
});

describe('onSale filter', () => {
  it('returns only discounted products, and can be scoped to a collection via manual membership', async () => {
    const col = await makeCollection({ slug: 'f-col' });
    const cat = await makeCategory({ slug: 'f-cat' });
    const otherCat = await makeCategory({ slug: 'f-cat-2' });

    const plain = await makeProduct(otherCat.id, {
      over: { price: 40 }, variants: [{ sku: 'fp1', stockQuantity: 3 }], collectionIds: [col.id],
    });
    const ownSale = await makeProduct(otherCat.id, {
      over: { price: 40, saleType: 'AMOUNT', saleValue: 10 }, variants: [{ sku: 'fp2', stockQuantity: 3 }], collectionIds: [col.id],
    });
    const viaPromotion = await makeProduct(cat.id, {
      over: { price: 40 }, variants: [{ sku: 'fp3', stockQuantity: 3 }], collectionIds: [col.id],
    });
    await postAdmin('/api/promotions', {
      nameEn: 'cat', nameAr: 'c', status: 'ACTIVE', type: 'PERCENT', value: 25,
      categoryTargets: [{ categoryId: cat.id, includeDescendants: false }],
    });

    const res = await request(app).get(`/api/products?collectionId=${col.id}&onSale=true`);
    const ids = res.body.items.map((p: { id: string }) => p.id).sort();
    expect(ids).toEqual([ownSale.id, viaPromotion.id].sort());
    expect(ids).not.toContain(plain.id);
  });
});

describe('Coupons', () => {
  it('CRUD + duplicate-code conflict', async () => {
    const made = await postAdmin('/api/coupons', { code: 'summer20', type: 'PERCENT', value: 20 });
    expect(made.status).toBe(201);
    expect(made.body.coupon.code).toBe('SUMMER20'); // stored upper-cased

    expect((await postAdmin('/api/coupons', { code: 'SUMMER20', type: 'PERCENT', value: 5 })).status).toBe(409);

    const off = await patchAdmin(`/api/coupons/${made.body.coupon.id}`, { isActive: false });
    expect(off.body.coupon.isActive).toBe(false);

    expect((await request(app).delete(`/api/coupons/${made.body.coupon.id}`).set(bearer(adminToken))).status).toBe(204);
  });

  it('POST /api/coupons/validate resolves an active in-window code, rejects others', async () => {
    await postAdmin('/api/coupons', { code: 'LIVE10', type: 'PERCENT', value: 10 });
    await postAdmin('/api/coupons', {
      code: 'GONE', type: 'AMOUNT', value: 5, endsAt: new Date(Date.now() - 1000).toISOString(),
    });
    await postAdmin('/api/coupons', { code: 'PAUSED', type: 'PERCENT', value: 10, isActive: false });

    const ok = await request(app).post('/api/coupons/validate').send({ code: 'live10' });
    expect(ok.status).toBe(200);
    expect(ok.body.coupon).toMatchObject({ code: 'LIVE10', type: 'PERCENT', value: 10 });

    for (const bad of ['GONE', 'PAUSED', 'NOPE']) {
      expect((await request(app).post('/api/coupons/validate').send({ code: bad })).status).toBe(404);
    }
  });

  it('rejects updating a coupon to a percentage value outside 0-100, checked against the MERGED value', async () => {
    const made = await postAdmin('/api/coupons', { code: 'MERGECHK', type: 'PERCENT', value: 20 });
    // Only `value` is sent — `type` (PERCENT) must come from the existing row
    // for this to be caught at all.
    const res = await patchAdmin(`/api/coupons/${made.body.coupon.id}`, { value: 150 });
    expect(res.status).toBe(400);
  });

  it('rejects an endsAt at or before startsAt, on both create and update', async () => {
    const startsAt = new Date('2027-01-10T00:00:00.000Z').toISOString();
    const endsAt = new Date('2027-01-01T00:00:00.000Z').toISOString();
    expect(
      (await postAdmin('/api/coupons', { code: 'BADWINDOW', type: 'PERCENT', value: 10, startsAt, endsAt })).status
    ).toBe(400);

    const ok = await postAdmin('/api/coupons', { code: 'GOODWINDOW', type: 'PERCENT', value: 10 });
    expect((await patchAdmin(`/api/coupons/${ok.body.coupon.id}`, { startsAt, endsAt })).status).toBe(400);
  });

  it('maxPerCustomer: null (explicit unlimited) survives an update that does not touch it', async () => {
    const made = await postAdmin('/api/coupons', {
      code: 'UNLIMITED1',
      type: 'PERCENT',
      value: 10,
      maxPerCustomer: null,
    });
    expect(made.body.coupon.maxPerCustomer).toBeNull();

    const res = await patchAdmin(`/api/coupons/${made.body.coupon.id}`, { isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.coupon.maxPerCustomer).toBeNull();
  });

  it('404s updating or deleting an unknown coupon id', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    expect((await patchAdmin(`/api/coupons/${missing}`, { isActive: false })).status).toBe(404);
    expect((await request(app).delete(`/api/coupons/${missing}`).set(bearer(adminToken))).status).toBe(404);
  });
});

describe('Checkout with a coupon', () => {
  it('applies the coupon to the discounted subtotal and snapshots it on the order', async () => {
    const cat = await makeCategory({ slug: 'co-cat' });
    const product = await makeProduct(cat.id, {
      over: { price: 50 },
      variants: [{ sku: 'cov1', size: 'M', color: 'Black', stockQuantity: 10 }],
    });
    const variantId = product.variants[0].id;

    // 10% catalog promotion on the category + a $10 coupon.
    await postAdmin('/api/promotions', {
      nameEn: 'cat', nameAr: 'c', status: 'ACTIVE', type: 'PERCENT', value: 10,
      categoryTargets: [{ categoryId: cat.id, includeDescendants: false }],
    });
    await postAdmin('/api/coupons', { code: 'TAKE10', type: 'AMOUNT', value: 10 });

    const buyer = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 2 });

    const res = await request(app)
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .send({
        deliveryName: 'Jane',
        deliveryPhone: '0791234567',
        deliveryAddress: '12 Rainbow Street',
        deliveryCity: 'Amman',
        deliveryRegion: 'MOUNT_LEBANON',
        couponCode: 'take10',
      });
    expect(res.status).toBe(201);
    const order = res.body.order;
    // 2 × (50 − 10%) = 90 subtotal; − $10 coupon = 80 merchandise.
    expect(Number(order.subtotal)).toBe(90);
    expect(order.couponCode).toBe('TAKE10');
    expect(Number(order.discountAmount)).toBe(10);
    expect(Number(order.total)).toBe(80 + Number(order.deliveryFee));
    expect(Number(order.items[0].unitPrice)).toBe(45);
  });

  it('rejects a checkout that names an unknown coupon', async () => {
    const cat = await makeCategory({ slug: 'cx-cat' });
    const product = await makeProduct(cat.id, {
      variants: [{ sku: 'cxv1', stockQuantity: 5 }],
    });
    const buyer = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId: product.variants[0].id, quantity: 1 });
    const res = await request(app)
      .post('/api/orders/checkout')
      .set(bearer(buyer.token))
      .send({
        deliveryName: 'Jane',
        deliveryPhone: '0791234567',
        deliveryAddress: '12 Rainbow Street',
        deliveryCity: 'Amman',
        deliveryRegion: 'MOUNT_LEBANON',
        couponCode: 'DOESNOTEXIST',
      });
    expect(res.status).toBe(400);
  });
});
