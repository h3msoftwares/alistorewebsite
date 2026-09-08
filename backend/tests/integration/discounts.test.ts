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

describe('Catalog discounts', () => {
  it('requires staff/admin for every write', async () => {
    const customer = (await createCustomer()).token;
    expect((await request(app).get('/api/discounts')).status).toBe(401);
    expect((await request(app).get('/api/discounts').set(bearer(customer))).status).toBe(403);
    expect(
      (await request(app).post('/api/discounts').set(bearer(customer)).send({})).status
    ).toBe(403);
  });

  it('creates an ALL / COLLECTION / CATEGORY discount and rejects bad shapes', async () => {
    const col = await makeCollection({ slug: 'd-col' });
    const cat = await makeCategory(col.id, { slug: 'd-cat' });

    const all = await postAdmin('/api/discounts', {
      nameEn: 'Site-wide',
      nameAr: 'على الكل',
      scope: 'ALL',
      type: 'PERCENT',
      value: 15,
    });
    expect(all.status).toBe(201);
    expect(all.body.discount).toMatchObject({ scope: 'ALL', stacking: 'STACK', isActive: true });

    const byCol = await postAdmin('/api/discounts', {
      nameEn: 'Collection',
      nameAr: 'مجموعة',
      scope: 'COLLECTION',
      collectionId: col.id,
      type: 'AMOUNT',
      value: 5,
    });
    expect(byCol.status).toBe(201);
    expect(byCol.body.discount.collectionID).toBe(col.id);

    const byCat = await postAdmin('/api/discounts', {
      nameEn: 'Category',
      nameAr: 'فئة',
      scope: 'CATEGORY',
      categoryId: cat.id,
      type: 'PERCENT',
      value: 20,
    });
    expect(byCat.status).toBe(201);
    expect(byCat.body.discount.categoryID).toBe(cat.id);

    // percentage over 100
    expect(
      (await postAdmin('/api/discounts', { nameEn: 'x', nameAr: 'x', scope: 'ALL', type: 'PERCENT', value: 150 }))
        .status
    ).toBe(400);
    // collection scope with no target
    expect(
      (await postAdmin('/api/discounts', { nameEn: 'x', nameAr: 'x', scope: 'COLLECTION', type: 'PERCENT', value: 10 }))
        .status
    ).toBe(400);
    // unknown collection id
    expect(
      (await postAdmin('/api/discounts', {
        nameEn: 'x',
        nameAr: 'x',
        scope: 'COLLECTION',
        collectionId: '00000000-0000-4000-8000-000000000000',
        type: 'PERCENT',
        value: 10,
      })).status
    ).toBe(404);
  });

  it('applies to product pricing: STACK compounds, OVERRIDE replaces the product sale', async () => {
    const col = await makeCollection({ slug: 'p-col' });
    const cat = await makeCategory(col.id, { slug: 'p-cat' });
    const product = await makeProduct(col.id, cat.id, {
      over: { price: 100, saleType: 'PERCENT', saleValue: 20 }, // own sale → 80
      variants: [{ sku: 'pv1', stockQuantity: 5 }],
    });

    // No catalog discount yet: effectivePrice is just the product sale.
    let list = await request(app).get(`/api/products?categoryId=${cat.id}`);
    expect(list.body.items[0].effectivePrice).toBe(80);

    // STACK 10% off the reduced price → 72.
    const stack = await postAdmin('/api/discounts', {
      nameEn: 'Stack', nameAr: 's', scope: 'CATEGORY', categoryId: cat.id, type: 'PERCENT', value: 10, stacking: 'STACK',
    });
    list = await request(app).get(`/api/products/${product.id}`);
    expect(list.body.product.effectivePrice).toBe(72);
    expect(list.body.product.onSale).toBe(true);
    expect(list.body.product.discount).toMatchObject({ type: 'PERCENT', value: 10, stacking: 'STACK' });

    // Switch it to OVERRIDE: 10% off the ORIGINAL price → 90 (product's 20% ignored).
    await patchAdmin(`/api/discounts/${stack.body.discount.id}`, { stacking: 'OVERRIDE' });
    list = await request(app).get(`/api/products/${product.id}`);
    expect(list.body.product.effectivePrice).toBe(90);
  });

  it('the most specific scope wins (CATEGORY over ALL)', async () => {
    const col = await makeCollection({ slug: 's-col' });
    const cat = await makeCategory(col.id, { slug: 's-cat' });
    const product = await makeProduct(col.id, cat.id, {
      over: { price: 100 },
      variants: [{ sku: 'sv1', stockQuantity: 5 }],
    });
    await postAdmin('/api/discounts', { nameEn: 'all', nameAr: 'a', scope: 'ALL', type: 'PERCENT', value: 5 });
    await postAdmin('/api/discounts', {
      nameEn: 'cat', nameAr: 'c', scope: 'CATEGORY', categoryId: cat.id, type: 'PERCENT', value: 30,
    });
    const res = await request(app).get(`/api/products/${product.id}`);
    expect(res.body.product.effectivePrice).toBe(70); // category's 30%, not the ALL 5%
  });

  it('an inactive or out-of-window discount does not apply', async () => {
    const col = await makeCollection({ slug: 'w-col' });
    const cat = await makeCategory(col.id, { slug: 'w-cat' });
    const product = await makeProduct(col.id, cat.id, {
      over: { price: 100 },
      variants: [{ sku: 'wv1', stockQuantity: 5 }],
    });
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await postAdmin('/api/discounts', {
      nameEn: 'expired', nameAr: 'e', scope: 'CATEGORY', categoryId: cat.id, type: 'PERCENT', value: 50, endsAt: past,
    });
    await postAdmin('/api/discounts', {
      nameEn: 'off', nameAr: 'o', scope: 'CATEGORY', categoryId: cat.id, type: 'PERCENT', value: 50, isActive: false,
    });
    const res = await request(app).get(`/api/products/${product.id}`);
    expect(res.body.product.effectivePrice).toBe(100);
    expect(res.body.product.onSale).toBe(false);
  });
});

describe('onSale filter', () => {
  it('returns only discounted products', async () => {
    const col = await makeCollection({ slug: 'f-col' });
    const cat = await makeCategory(col.id, { slug: 'f-cat' });
    const otherCat = await makeCategory(col.id, { slug: 'f-cat-2' });

    const plain = await makeProduct(col.id, otherCat.id, {
      over: { price: 40 }, variants: [{ sku: 'fp1', stockQuantity: 3 }],
    });
    const ownSale = await makeProduct(col.id, otherCat.id, {
      over: { price: 40, saleType: 'AMOUNT', saleValue: 10 }, variants: [{ sku: 'fp2', stockQuantity: 3 }],
    });
    const viaDiscount = await makeProduct(col.id, cat.id, {
      over: { price: 40 }, variants: [{ sku: 'fp3', stockQuantity: 3 }],
    });
    await postAdmin('/api/discounts', {
      nameEn: 'cat', nameAr: 'c', scope: 'CATEGORY', categoryId: cat.id, type: 'PERCENT', value: 25,
    });

    const res = await request(app).get(`/api/products?collectionId=${col.id}&onSale=true`);
    const ids = res.body.items.map((p: { id: string }) => p.id).sort();
    expect(ids).toEqual([ownSale.id, viaDiscount.id].sort());
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
});

describe('Checkout with a coupon', () => {
  it('applies the coupon to the discounted subtotal and snapshots it on the order', async () => {
    const col = await makeCollection({ slug: 'co-col' });
    const cat = await makeCategory(col.id, { slug: 'co-cat' });
    const product = await makeProduct(col.id, cat.id, {
      over: { price: 50 },
      variants: [{ sku: 'cov1', size: 'M', color: 'Black', stockQuantity: 10 }],
    });
    const variantId = product.variants[0].id;

    // 10% catalog discount on the category + a $10 coupon.
    await postAdmin('/api/discounts', {
      nameEn: 'cat', nameAr: 'c', scope: 'CATEGORY', categoryId: cat.id, type: 'PERCENT', value: 10,
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
    const col = await makeCollection({ slug: 'cx-col' });
    const cat = await makeCategory(col.id, { slug: 'cx-cat' });
    const product = await makeProduct(col.id, cat.id, {
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
