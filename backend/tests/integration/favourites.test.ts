import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let productId: string;
let otherProductId: string;

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory();
  const p = await makeProduct(cat.id, {
    over: {
      nameEn: 'Silk Robe',
      nameAr: 'روب حرير',
      price: 40,
      saleType: 'PERCENT',
      saleValue: 25,
      images: { create: [{ url: 'https://img.test/robe.jpg', altEn: 'Silk Robe', sortOrder: 0 }] },
    },
  });
  const p2 = await makeProduct(cat.id, { over: { nameEn: 'Wool Scarf' } });
  productId = p.id;
  otherProductId = p2.id;
});

describe('Favourites API', () => {
  it('requires auth on every route', async () => {
    expect((await request(app).get('/api/favourites')).status).toBe(401);
    expect((await request(app).post('/api/favourites').send({ productID: productId })).status).toBe(401);
    expect((await request(app).delete(`/api/favourites/${productId}`)).status).toBe(401);
  });

  it('returns an empty list for a new user', async () => {
    const { token } = await createCustomer();
    const res = await request(app).get('/api/favourites').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.favourites).toEqual([]);
  });

  it('adds a favourite and reflects it in GET with hydrated product data', async () => {
    const { token } = await createCustomer();

    const add = await request(app)
      .post('/api/favourites')
      .set(bearer(token))
      .send({ productID: productId });
    expect(add.status).toBe(200);
    expect(add.body.favourite.product.id).toBe(productId);

    const list = await request(app).get('/api/favourites').set(bearer(token));
    expect(list.status).toBe(200);
    expect(list.body.favourites).toHaveLength(1);

    const entry = list.body.favourites[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('dateCreated');
    // Hydrated in the same shape the catalog endpoints return.
    expect(entry.product).toMatchObject({
      id: productId,
      nameEn: 'Silk Robe',
      nameAr: 'روب حرير',
      effectivePrice: 30, // 40 - 25%
      onSale: true,
    });
    expect(entry.product.images).toHaveLength(1);
    expect(entry.product.images[0].url).toBe('https://img.test/robe.jpg');
    expect(Array.isArray(entry.product.variants)).toBe(true);
  });

  it('lists favourites newest-first', async () => {
    const { token } = await createCustomer();
    // Heart the older product first, then the other one.
    await request(app).post('/api/favourites').set(bearer(token)).send({ productID: otherProductId });
    await request(app).post('/api/favourites').set(bearer(token)).send({ productID: productId });

    // Make the first heart unambiguously older (POSTs in one test can land in
    // the same millisecond).
    await prisma.favorite.updateMany({
      where: { productID: otherProductId },
      data: { dateCreated: new Date('2000-01-01T00:00:00Z') },
    });

    const list = await request(app).get('/api/favourites').set(bearer(token));
    expect(list.body.favourites.map((f: { product: { id: string } }) => f.product.id)).toEqual([
      productId,
      otherProductId,
    ]);
  });

  it('is idempotent — POSTing the same product twice does not error or duplicate', async () => {
    const { token } = await createCustomer();

    const first = await request(app)
      .post('/api/favourites')
      .set(bearer(token))
      .send({ productID: productId });
    const second = await request(app)
      .post('/api/favourites')
      .set(bearer(token))
      .send({ productID: productId });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const list = await request(app).get('/api/favourites').set(bearer(token));
    expect(list.body.favourites).toHaveLength(1);
    expect(await prisma.favorite.count()).toBe(1);
  });

  it('removes a favourite by productID and reflects the removal in GET', async () => {
    const { token } = await createCustomer();
    await request(app).post('/api/favourites').set(bearer(token)).send({ productID: productId });
    await request(app).post('/api/favourites').set(bearer(token)).send({ productID: otherProductId });

    const del = await request(app).delete(`/api/favourites/${productId}`).set(bearer(token));
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/favourites').set(bearer(token));
    expect(list.body.favourites).toHaveLength(1);
    expect(list.body.favourites[0].product.id).toBe(otherProductId);
  });

  it('404s DELETE for a product that was never favourited (same as /api/addresses)', async () => {
    const { token } = await createCustomer();
    const res = await request(app).delete(`/api/favourites/${productId}`).set(bearer(token));
    expect(res.status).toBe(404);
  });

  it("cannot see another user's favourites", async () => {
    const { token: a } = await createCustomer();
    const { token: b } = await createCustomer();
    await request(app).post('/api/favourites').set(bearer(a)).send({ productID: productId });

    const list = await request(app).get('/api/favourites').set(bearer(b));
    expect(list.body.favourites).toEqual([]);
  });

  it('400s a non-uuid productID', async () => {
    const { token } = await createCustomer();
    const res = await request(app).post('/api/favourites').set(bearer(token)).send({ productID: 'nope' });
    expect(res.status).toBe(400);
  });

  it('404s POST for an unknown product', async () => {
    const { token } = await createCustomer();
    const res = await request(app)
      .post('/api/favourites')
      .set(bearer(token))
      .send({ productID: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);
  });

  describe('soft-deleted products', () => {
    it('404s POST for a soft-deleted product', async () => {
      const { token } = await createCustomer();
      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false, deletedAt: new Date() },
      });

      const res = await request(app)
        .post('/api/favourites')
        .set(bearer(token))
        .send({ productID: productId });
      expect(res.status).toBe(404);
    });

    it('excludes a product soft-deleted after it was favourited from GET', async () => {
      const { token } = await createCustomer();
      await request(app).post('/api/favourites').set(bearer(token)).send({ productID: productId });
      await request(app).post('/api/favourites').set(bearer(token)).send({ productID: otherProductId });

      await prisma.product.update({
        where: { id: productId },
        data: { isActive: false, deletedAt: new Date() },
      });

      const list = await request(app).get('/api/favourites').set(bearer(token));
      expect(list.body.favourites).toHaveLength(1);
      expect(list.body.favourites[0].product.id).toBe(otherProductId);
    });
  });
});
