import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

let collectionId: string;
let categoryId: string;
let adminToken: string;

beforeEach(async () => {
  const col = await makeCollection({ slug: 'root' });
  const cat = await makeCategory(col.id);
  collectionId = col.id;
  categoryId = cat.id;
  adminToken = (await createAdmin()).token;
});

const productBody = (over: Record<string, unknown> = {}) => ({
  sku: 'SKU-1',
  nameEn: 'Tee',
  nameAr: 'تيشيرت',
  categoryId,
  collectionId,
  price: 20,
  variants: [{ sku: 'SKU-1-M', size: 'M', color: 'Black', stockQuantity: 5 }],
  ...over,
});

describe('Products API', () => {
  describe('GET /api/products (list + filters)', () => {
    it('returns active products with pagination envelope', async () => {
      await makeProduct(collectionId, categoryId, { over: { nameEn: 'Alpha', price: 10 } });
      await makeProduct(collectionId, categoryId, { over: { nameEn: 'Beta', price: 30 } });

      const res = await request(app).get('/api/products?pageSize=1&page=1');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(res.body.items).toHaveLength(1);
    });

    it('filters by price range and sorts', async () => {
      await makeProduct(collectionId, categoryId, { over: { nameEn: 'Cheap', price: 5 } });
      await makeProduct(collectionId, categoryId, { over: { nameEn: 'Mid', price: 25 } });
      await makeProduct(collectionId, categoryId, { over: { nameEn: 'Pricey', price: 90 } });

      const res = await request(app).get('/api/products?minPrice=10&maxPrice=50&sort=price_desc');
      expect(res.body.items.map((p: { nameEn: string }) => p.nameEn)).toEqual(['Mid']);
    });

    it('filters by search term and by variant size', async () => {
      await makeProduct(collectionId, categoryId, { over: { nameEn: 'Red Hoodie' } });
      await makeProduct(collectionId, categoryId, {
        over: { nameEn: 'Blue Cap' },
        variants: [{ size: 'L', color: 'Blue', stockQuantity: 2 }],
      });

      expect((await request(app).get('/api/products?search=hoodie')).body.items).toHaveLength(1);
      expect((await request(app).get('/api/products?size=L')).body.items).toHaveLength(1);
    });

    it('hides soft-deleted products from the public list', async () => {
      const p = await makeProduct(collectionId, categoryId);
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, deletedAt: new Date() },
      });
      const res = await request(app).get('/api/products');
      expect(res.body.items).toHaveLength(0);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns a product with variants/images/category/collection', async () => {
      const p = await makeProduct(collectionId, categoryId);
      const res = await request(app).get(`/api/products/${p.id}`);
      expect(res.status).toBe(200);
      expect(res.body.product.variants).toHaveLength(1);
      expect(res.body.product.collection.slug).toBe('root');
    });

    it('404s the public on an inactive product but an admin can still fetch it', async () => {
      const p = await makeProduct(collectionId, categoryId);
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, deletedAt: new Date() },
      });

      expect((await request(app).get(`/api/products/${p.id}`)).status).toBe(404);
      const asAdmin = await request(app).get(`/api/products/${p.id}`).set(bearer(adminToken));
      expect(asAdmin.status).toBe(200);
    });
  });

  describe('POST /api/products (admin)', () => {
    it('401 anon / 403 customer', async () => {
      expect((await request(app).post('/api/products').send(productBody())).status).toBe(401);
      const { token } = await createCustomer();
      expect(
        (await request(app).post('/api/products').set(bearer(token)).send(productBody())).status
      ).toBe(403);
    });

    it('creates a product with variants', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody());
      expect(res.status).toBe(201);
      expect(res.body.product.variants).toHaveLength(1);
    });

    it('404s when category/collection do not exist', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ categoryId: UNKNOWN }));
      expect(res.status).toBe(404);
    });

    it('409s duplicate SKU and 409s duplicate variant combos', async () => {
      await request(app).post('/api/products').set(bearer(adminToken)).send(productBody());

      const dupeSku = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ variants: [{ sku: 'OTHER', size: 'S', color: 'Red' }] }));
      expect(dupeSku.status).toBe(409);

      const dupeVariant = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(
          productBody({
            sku: 'SKU-2',
            variants: [
              { sku: 'v1', size: 'M', color: 'Black' },
              { sku: 'v2', size: 'M', color: 'Black' },
            ],
          })
        );
      expect(dupeVariant.status).toBe(409);
    });

    it('400s with no variants', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ variants: [] }));
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH / DELETE /api/products/:id (admin)', () => {
    it('updates a product', async () => {
      const p = await makeProduct(collectionId, categoryId);
      const res = await request(app)
        .patch(`/api/products/${p.id}`)
        .set(bearer(adminToken))
        .send({ nameEn: 'Renamed', price: 99 });
      expect(res.status).toBe(200);
      expect(res.body.product).toMatchObject({ nameEn: 'Renamed' });
      expect(Number(res.body.product.price)).toBe(99);
    });

    it('soft-deletes a product', async () => {
      const p = await makeProduct(collectionId, categoryId);
      const res = await request(app).delete(`/api/products/${p.id}`).set(bearer(adminToken));
      expect(res.status).toBe(204);
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.deletedAt).not.toBeNull();
      expect(row?.isActive).toBe(false);
    });
  });

  describe('Product variants (admin sub-resource)', () => {
    it('adds a variant and writes an INITIAL stock movement', async () => {
      const p = await makeProduct(collectionId, categoryId);
      const res = await request(app)
        .post(`/api/products/${p.id}/variants`)
        .set(bearer(adminToken))
        .send({ sku: 'NEW-V', size: 'L', color: 'White', stockQuantity: 7 });
      expect(res.status).toBe(201);
      const movements = await prisma.stockMovement.findMany({ where: { variantID: res.body.variant.id } });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ type: 'INITIAL', quantity: 7 });
    });

    it('409s a duplicate size/colour combo on the same product', async () => {
      const p = await makeProduct(collectionId, categoryId, {
        variants: [{ sku: 'a', size: 'M', color: 'Black' }],
      });
      const res = await request(app)
        .post(`/api/products/${p.id}/variants`)
        .set(bearer(adminToken))
        .send({ sku: 'b', size: 'M', color: 'Black' });
      expect(res.status).toBe(409);
    });

    it('updates a variant stock and logs an ADJUSTMENT', async () => {
      const p = await makeProduct(collectionId, categoryId, {
        variants: [{ sku: 'a', size: 'M', color: 'Black', stockQuantity: 4 }],
      });
      const variantId = p.variants[0].id;
      const res = await request(app)
        .patch(`/api/products/${p.id}/variants/${variantId}`)
        .set(bearer(adminToken))
        .send({ stockQuantity: 10 });
      expect(res.status).toBe(200);
      const mv = await prisma.stockMovement.findFirst({ where: { variantID: variantId } });
      expect(mv).toMatchObject({ type: 'ADJUSTMENT', quantity: 6 });
    });

    it('deletes a variant, but 409s when it is referenced by an order', async () => {
      const p = await makeProduct(collectionId, categoryId, {
        variants: [
          { sku: 'a', size: 'M', color: 'Black' },
          { sku: 'b', size: 'L', color: 'Black' },
        ],
      });
      const ok = await request(app)
        .delete(`/api/products/${p.id}/variants/${p.variants[1].id}`)
        .set(bearer(adminToken));
      expect(ok.status).toBe(204);

      const order = await prisma.order.create({
        data: {
          orderNumber: 'AS-1',
          deliveryName: 'x',
          deliveryPhone: '123456',
          deliveryAddress: 'street',
          deliveryCity: 'city',
          subtotal: 1,
          total: 1,
          items: {
            create: {
              variantID: p.variants[0].id,
              productName: 'x',
              productSKU: 'x',
              variantSKU: 'x',
              quantity: 1,
              unitPrice: 1,
              lineTotal: 1,
            },
          },
        },
      });
      expect(order).toBeTruthy();
      const blocked = await request(app)
        .delete(`/api/products/${p.id}/variants/${p.variants[0].id}`)
        .set(bearer(adminToken));
      expect(blocked.status).toBe(409);
    });
  });

  describe('Product images (admin sub-resource)', () => {
    it('adds / updates / deletes an image', async () => {
      const p = await makeProduct(collectionId, categoryId);
      const add = await request(app)
        .post(`/api/products/${p.id}/images`)
        .set(bearer(adminToken))
        .send({ url: 'https://cdn.test/p.jpg', sortOrder: 2 });
      expect(add.status).toBe(201);

      const upd = await request(app)
        .patch(`/api/products/${p.id}/images/${add.body.image.id}`)
        .set(bearer(adminToken))
        .send({ altEn: 'front' });
      expect(upd.body.image.altEn).toBe('front');

      const del = await request(app)
        .delete(`/api/products/${p.id}/images/${add.body.image.id}`)
        .set(bearer(adminToken));
      expect(del.status).toBe(204);
    });
  });

  describe('quantity + sale', () => {
    it('accepts a zero or negative quantity without touching isActive', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ quantity: -3 }));
      expect(res.status).toBe(201);
      expect(res.body.product.quantity).toBe(-3);
      expect(res.body.product.isActive).toBe(true);
    });

    it('defaults quantity to 0 when omitted', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody());
      expect(res.body.product.quantity).toBe(0);
    });

    it('applies a PERCENT sale and returns effectivePrice + onSale', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ price: 20, saleType: 'PERCENT', saleValue: 25 }));
      expect(res.status).toBe(201);
      expect(res.body.product.effectivePrice).toBe(15);
      expect(res.body.product.onSale).toBe(true);
    });

    it('applies an AMOUNT sale, clamped at 0', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ sku: 'SKU-A', price: 20, saleType: 'AMOUNT', saleValue: 30 }));
      expect(res.body.product.effectivePrice).toBe(0);
    });

    it('a product with no sale reports effectivePrice === price and onSale false', async () => {
      const p = await makeProduct(collectionId, categoryId, { over: { price: 12 } });
      const res = await request(app).get(`/api/products/${p.id}`);
      expect(Number(res.body.product.effectivePrice)).toBe(12);
      expect(res.body.product.onSale).toBe(false);
    });

    it('400s a sale missing its value, or a percent over 100', async () => {
      const missing = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ saleType: 'PERCENT' }));
      expect(missing.status).toBe(400);

      const tooBig = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ sku: 'SKU-B', saleType: 'PERCENT', saleValue: 150 }));
      expect(tooBig.status).toBe(400);
    });

    it('PATCH updates quantity and clears the sale with saleType:null', async () => {
      const created = (
        await request(app)
          .post('/api/products')
          .set(bearer(adminToken))
          .send(productBody({ price: 40, saleType: 'PERCENT', saleValue: 10 }))
      ).body.product;
      expect(created.onSale).toBe(true);

      const res = await request(app)
        .patch(`/api/products/${created.id}`)
        .set(bearer(adminToken))
        .send({ quantity: 7, saleType: null, saleValue: null });
      expect(res.status).toBe(200);
      expect(res.body.product.quantity).toBe(7);
      expect(res.body.product.onSale).toBe(false);
      expect(Number(res.body.product.effectivePrice)).toBe(40);
    });
  });
});
