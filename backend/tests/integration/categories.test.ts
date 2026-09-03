import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

describe('Categories API', () => {
  describe('GET /api/categories', () => {
    it('lists active categories, optionally filtered by collection', async () => {
      const a = await makeCollection({ slug: 'a' });
      const b = await makeCollection({ slug: 'b' });
      await makeCategory(a.id, { nameEn: 'A-cat' });
      await makeCategory(b.id, { nameEn: 'B-cat' });
      await makeCategory(a.id, { nameEn: 'Inactive', isActive: false });

      const all = await request(app).get('/api/categories');
      expect(all.status).toBe(200);
      expect(all.body.categories).toHaveLength(2);

      const filtered = await request(app).get(`/api/categories?collectionId=${a.id}`);
      expect(filtered.body.categories).toHaveLength(1);
      expect(filtered.body.categories[0].nameEn).toBe('A-cat');
      expect(filtered.body.categories[0].collection.slug).toBe('a');
    });
  });

  describe('GET /api/categories/:id', () => {
    it('returns one category with images + children', async () => {
      const col = await makeCollection({ slug: 'c' });
      const parent = await makeCategory(col.id, { nameEn: 'Parent' });
      await makeCategory(col.id, { nameEn: 'Child', parentCategoryID: parent.id });

      const res = await request(app).get(`/api/categories/${parent.id}`);
      expect(res.status).toBe(200);
      expect(res.body.category.children).toHaveLength(1);
      expect(Array.isArray(res.body.category.images)).toBe(true);
    });

    it('404s unknown id', async () => {
      const res = await request(app).get(`/api/categories/${UNKNOWN}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/categories (admin)', () => {
    it('401 anon / 403 customer', async () => {
      const col = await makeCollection({ slug: 'x' });
      const body = { collectionId: col.id, nameEn: 'N', nameAr: 'N', slug: 'n-cat' };

      expect((await request(app).post('/api/categories').send(body)).status).toBe(401);

      const { token } = await createCustomer();
      expect(
        (await request(app).post('/api/categories').set(bearer(token)).send(body)).status
      ).toBe(403);
    });

    it('creates a category under a collection', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'y' });
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ collectionId: col.id, nameEn: 'Hats', nameAr: 'قبعات', slug: 'hats' });
      expect(res.status).toBe(201);
      expect(res.body.category).toMatchObject({ slug: 'hats', collectionID: col.id });
    });

    it('404s when the collection does not exist', async () => {
      const { token } = await createAdmin();
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ collectionId: UNKNOWN, nameEn: 'H', nameAr: 'H', slug: 'h-cat' });
      expect(res.status).toBe(404);
    });

    it('409s a duplicate slug', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'z' });
      await makeCategory(col.id, { slug: 'taken' });
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ collectionId: col.id, nameEn: 'T', nameAr: 'T', slug: 'taken' });
      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /api/categories/:id (admin)', () => {
    it('re-links a category to a different collection', async () => {
      const { token } = await createAdmin();
      const a = await makeCollection({ slug: 'aa' });
      const b = await makeCollection({ slug: 'bb' });
      const cat = await makeCategory(a.id);

      const res = await request(app)
        .patch(`/api/categories/${cat.id}`)
        .set(bearer(token))
        .send({ collectionId: b.id });
      expect(res.status).toBe(200);
      expect(res.body.category.collectionID).toBe(b.id);
    });
  });

  describe('DELETE /api/categories/:id (admin)', () => {
    it('deletes an empty category', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'dc' });
      const cat = await makeCategory(col.id);
      const res = await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token));
      expect(res.status).toBe(204);
    });

    it('409s a category that still has products', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'dc2' });
      const cat = await makeCategory(col.id);
      await makeProduct(col.id, cat.id);
      const res = await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token));
      expect(res.status).toBe(409);
    });
  });

  describe('Category images (admin sub-resource)', () => {
    it('adds / updates / deletes', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'ci' });
      const cat = await makeCategory(col.id);

      const add = await request(app)
        .post(`/api/categories/${cat.id}/images`)
        .set(bearer(token))
        .send({ url: 'https://cdn.test/c.jpg' });
      expect(add.status).toBe(201);

      const upd = await request(app)
        .patch(`/api/categories/${cat.id}/images/${add.body.image.id}`)
        .set(bearer(token))
        .send({ sortOrder: 3 });
      expect(upd.body.image.sortOrder).toBe(3);

      const del = await request(app)
        .delete(`/api/categories/${cat.id}/images/${add.body.image.id}`)
        .set(bearer(token));
      expect(del.status).toBe(204);
      expect(await prisma.categoryImage.count()).toBe(0);
    });
  });
});
