import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory } from '../helpers/factories';

const app = buildApp();

let adminToken: string;
let customerToken: string;

beforeAll(async () => {
  // tokens only need a signed user id + role; created fresh each test run
});

async function tokens() {
  adminToken = (await createAdmin()).token;
  customerToken = (await createCustomer()).token;
}

describe('Collections API', () => {
  describe('GET /api/collections', () => {
    it('lists only active collections for the public, with image + counts', async () => {
      await makeCollection({ nameEn: 'Active', slug: 'active-col' });
      await makeCollection({ nameEn: 'Hidden', slug: 'hidden-col', isActive: false });

      const res = await request(app).get('/api/collections');
      expect(res.status).toBe(200);
      expect(res.body.collections).toHaveLength(1);
      expect(res.body.collections[0]).toMatchObject({ nameEn: 'Active', slug: 'active-col' });
      expect(res.body.collections[0]._count).toEqual({ categories: 0, products: 0 });
      expect(Array.isArray(res.body.collections[0].images)).toBe(true);
    });

    it('includeInactive=true returns hidden collections too', async () => {
      await makeCollection({ slug: 'a-col' });
      await makeCollection({ slug: 'b-col', isActive: false });

      const res = await request(app).get('/api/collections?includeInactive=true');
      expect(res.status).toBe(200);
      expect(res.body.collections).toHaveLength(2);
    });

    it('carries showInNav (false by default) + accentColor', async () => {
      await makeCollection({ slug: 'nav-col' });
      const res = await request(app).get('/api/collections');
      expect(res.body.collections[0]).toMatchObject({ showInNav: false, accentColor: null });
    });
  });

  describe('GET /api/collections/:id and /slug/:slug', () => {
    it('returns a collection with nested active categories', async () => {
      const col = await makeCollection({ slug: 'shoes' });
      await makeCategory(col.id, { nameEn: 'Sneakers' });

      const byId = await request(app).get(`/api/collections/${col.id}`);
      expect(byId.status).toBe(200);
      expect(byId.body.collection.categories).toHaveLength(1);

      const bySlug = await request(app).get('/api/collections/slug/shoes');
      expect(bySlug.status).toBe(200);
      expect(bySlug.body.collection.id).toBe(col.id);
    });

    it('404s an unknown id', async () => {
      const res = await request(app).get('/api/collections/00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('400s a non-uuid id', async () => {
      const res = await request(app).get('/api/collections/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/collections (admin)', () => {
    it('rejects anonymous with 401', async () => {
      const res = await request(app)
        .post('/api/collections')
        .send({ nameEn: 'X', nameAr: 'X', slug: 'x-col' });
      expect(res.status).toBe(401);
    });

    it('rejects a CUSTOMER with 403', async () => {
      await tokens();
      const res = await request(app)
        .post('/api/collections')
        .set(bearer(customerToken))
        .send({ nameEn: 'X', nameAr: 'X', slug: 'x-col' });
      expect(res.status).toBe(403);
    });

    it('creates a collection and can attach existing categories', async () => {
      await tokens();
      const loose = await makeCollection({ slug: 'loose' });
      const cat = await makeCategory(loose.id);

      const res = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'New', nameAr: 'جديد', slug: 'new-col', categoryIds: [cat.id] });

      expect(res.status).toBe(201);
      expect(res.body.collection.slug).toBe('new-col');
      expect(res.body.collection.categories).toHaveLength(1);
      const moved = await prisma.category.findUnique({ where: { id: cat.id } });
      expect(moved?.collectionID).toBe(res.body.collection.id);
    });

    it('409s a duplicate slug', async () => {
      await tokens();
      await makeCollection({ slug: 'dupe' });
      const res = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'Dupe', nameAr: 'Dupe', slug: 'dupe' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('400s a bad slug', async () => {
      await tokens();
      const res = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'X', nameAr: 'X', slug: 'Not A Slug' });
      expect(res.status).toBe(400);
    });

    it('400s a reserved slug (would be shadowed by a static route)', async () => {
      await tokens();
      const res = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'X', nameAr: 'X', slug: 'cart' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts showInNav + a hex accentColor and echoes them', async () => {
      await tokens();
      const res = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'Sale', nameAr: 'تخفيضات', slug: 'summer-sale', showInNav: true, accentColor: '#123abc' });
      expect(res.status).toBe(201);
      expect(res.body.collection).toMatchObject({ showInNav: true, accentColor: '#123abc' });
    });

    it('400s a non-hex accentColor', async () => {
      await tokens();
      const res = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'X', nameAr: 'X', slug: 'bad-hex', accentColor: 'red' });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/collections/:id (admin)', () => {
    it('updates fields', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'p' });
      const res = await request(app)
        .patch(`/api/collections/${col.id}`)
        .set(bearer(adminToken))
        .send({ nameEn: 'Renamed', isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.collection).toMatchObject({ nameEn: 'Renamed', isActive: false });
    });

    it('toggles showInNav, sets and clears accentColor', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'q' });

      const on = await request(app)
        .patch(`/api/collections/${col.id}`)
        .set(bearer(adminToken))
        .send({ showInNav: true, sortOrder: 5, accentColor: '#abcdef' });
      expect(on.body.collection).toMatchObject({ showInNav: true, sortOrder: 5, accentColor: '#abcdef' });

      const clear = await request(app)
        .patch(`/api/collections/${col.id}`)
        .set(bearer(adminToken))
        .send({ accentColor: null });
      expect(clear.status).toBe(200);
      expect(clear.body.collection.accentColor).toBeNull();
    });

    it('404s unknown id', async () => {
      await tokens();
      const res = await request(app)
        .patch('/api/collections/00000000-0000-4000-8000-000000000000')
        .set(bearer(adminToken))
        .send({ nameEn: 'x' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/collections/:id (admin)', () => {
    it('deletes an empty collection and detaches its categories (they survive as standalone)', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'del' });
      const cat = await makeCategory(col.id);

      const res = await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken));
      expect(res.status).toBe(204);
      expect(await prisma.collection.count()).toBe(0);

      const row = await prisma.category.findUnique({ where: { id: cat.id } });
      expect(row).not.toBeNull();
      expect(row?.collectionID).toBeNull();
    });

    it('409s when the collection still has products', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'has-prod' });
      const cat = await makeCategory(col.id);
      await prisma.product.create({
        data: { sku: 'P1', nameEn: 'P', nameAr: 'P', categoryID: cat.id, collectionID: col.id, price: 10 },
      });

      const res = await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken));
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/collections/:id/categories (link)', () => {
    it('moves categories into the collection', async () => {
      await tokens();
      const a = await makeCollection({ slug: 'a' });
      const b = await makeCollection({ slug: 'b' });
      const cat = await makeCategory(a.id);

      const res = await request(app)
        .post(`/api/collections/${b.id}/categories`)
        .set(bearer(adminToken))
        .send({ categoryIds: [cat.id] });

      expect(res.status).toBe(200);
      const moved = await prisma.category.findUnique({ where: { id: cat.id } });
      expect(moved?.collectionID).toBe(b.id);
    });

    it('404s if a category id does not exist', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'c' });
      const res = await request(app)
        .post(`/api/collections/${col.id}/categories`)
        .set(bearer(adminToken))
        .send({ categoryIds: ['00000000-0000-4000-8000-000000000000'] });
      expect(res.status).toBe(404);
    });
  });

  describe('Collection images (admin sub-resource)', () => {
    it('adds, updates and deletes an image', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'img' });

      const add = await request(app)
        .post(`/api/collections/${col.id}/images`)
        .set(bearer(adminToken))
        .send({ url: 'https://cdn.test/x.jpg', altEn: 'x', sortOrder: 1 });
      expect(add.status).toBe(201);
      const imageId = add.body.image.id;

      const upd = await request(app)
        .patch(`/api/collections/${col.id}/images/${imageId}`)
        .set(bearer(adminToken))
        .send({ altEn: 'updated', sortOrder: 5 });
      expect(upd.status).toBe(200);
      expect(upd.body.image).toMatchObject({ altEn: 'updated', sortOrder: 5 });

      const del = await request(app)
        .delete(`/api/collections/${col.id}/images/${imageId}`)
        .set(bearer(adminToken));
      expect(del.status).toBe(204);
      expect(await prisma.collectionImage.count()).toBe(0);
    });

    it('rejects a non-url image', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'img2' });
      const res = await request(app)
        .post(`/api/collections/${col.id}/images`)
        .set(bearer(adminToken))
        .send({ url: 'not-a-url' });
      expect(res.status).toBe(400);
    });

    it("404s updating an image that belongs to a different collection", async () => {
      await tokens();
      const a = await makeCollection({ slug: 'ia' });
      const b = await makeCollection({ slug: 'ib' });
      const img = await prisma.collectionImage.create({
        data: { collectionID: a.id, url: 'https://cdn.test/a.jpg' },
      });
      const res = await request(app)
        .patch(`/api/collections/${b.id}/images/${img.id}`)
        .set(bearer(adminToken))
        .send({ altEn: 'nope' });
      expect(res.status).toBe(404);
    });
  });
});
