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

    it('?standalone=true returns only categories with no collection', async () => {
      const col = await makeCollection({ slug: 'sa' });
      await makeCategory(col.id, { nameEn: 'Attached' });
      await makeCategory(null, { nameEn: 'Free' });

      const res = await request(app).get('/api/categories?standalone=true');
      expect(res.status).toBe(200);
      expect(res.body.categories).toHaveLength(1);
      expect(res.body.categories[0].nameEn).toBe('Free');
      expect(res.body.categories[0].collection).toBeNull();
    });

    it('?showOnHome=true returns featured categories across every collection', async () => {
      const a = await makeCollection({ slug: 'home-a' });
      const b = await makeCollection({ slug: 'home-b' });
      await makeCategory(a.id, { nameEn: 'Featured A', showOnHome: true });
      await makeCategory(b.id, { nameEn: 'Featured B', showOnHome: true });
      await makeCategory(null, { nameEn: 'Featured standalone', showOnHome: true });
      await makeCategory(a.id, { nameEn: 'Not featured', showOnHome: false });

      const res = await request(app).get('/api/categories?showOnHome=true');
      expect(res.status).toBe(200);
      expect(res.body.categories.map((c: { nameEn: string }) => c.nameEn).sort()).toEqual(
        ['Featured A', 'Featured B', 'Featured standalone'].sort()
      );
    });
  });

  describe('GET /api/categories/slug/:slug', () => {
    it('returns one category by slug (standalone included)', async () => {
      await makeCategory(null, { slug: 'clearance' });
      const res = await request(app).get('/api/categories/slug/clearance');
      expect(res.status).toBe(200);
      expect(res.body.category.slug).toBe('clearance');
      expect(res.body.category.collection).toBeNull();
    });

    it('404s an unknown slug', async () => {
      const res = await request(app).get('/api/categories/slug/nope');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/categories/:id/products (preview)', () => {
    it('returns the shaped, paginated product list scoped to the category', async () => {
      const cat = await makeCategory(null, { slug: 'preview-cat' });
      await makeProduct(null, cat.id, { over: { nameEn: 'P1', price: 10 } });
      await makeProduct(null, cat.id, { over: { nameEn: 'P2', price: 20, saleType: 'PERCENT', saleValue: 50 } });
      // a product in a different category must not leak in
      const other = await makeCategory(null, { slug: 'other-cat' });
      await makeProduct(null, other.id);

      const res = await request(app).get(`/api/categories/${cat.id}/products?pageSize=1`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toHaveProperty('effectivePrice');
      expect(res.body.items[0]).toHaveProperty('onSale');
    });

    it('404s an unknown category', async () => {
      const res = await request(app).get(`/api/categories/${UNKNOWN}/products`);
      expect(res.status).toBe(404);
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

    it('creates a standalone category with no collectionId', async () => {
      const { token } = await createAdmin();
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ nameEn: 'Clearance', nameAr: 'تصفية', slug: 'clearance' });
      expect(res.status).toBe(201);
      expect(res.body.category.collectionID).toBeNull();
    });

    it('accepts an explicit null collectionId', async () => {
      const { token } = await createAdmin();
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ collectionId: null, nameEn: 'Bundles', nameAr: 'حزم', slug: 'bundles' });
      expect(res.status).toBe(201);
      expect(res.body.category.collectionID).toBeNull();
    });

    it('showOnHome defaults false and can be set true on create, then toggled off via PATCH', async () => {
      const { token } = await createAdmin();
      const created = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ nameEn: 'Row', nameAr: 'صف', slug: 'home-row-cat', showOnHome: true });
      expect(created.status).toBe(201);
      expect(created.body.category.showOnHome).toBe(true);

      const patched = await request(app)
        .patch(`/api/categories/${created.body.category.id}`)
        .set(bearer(token))
        .send({ showOnHome: false });
      expect(patched.status).toBe(200);
      expect(patched.body.category.showOnHome).toBe(false);
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
    it('changing homeSortOrder does not deselect the category from the home page', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'hs' });
      const cat = await makeCategory(col.id);
      await request(app)
        .patch(`/api/categories/${cat.id}`)
        .set(bearer(token))
        .send({ showOnHome: true, sortOrder: 2, homeSortOrder: 40 });

      const res = await request(app)
        .patch(`/api/categories/${cat.id}`)
        .set(bearer(token))
        .send({ homeSortOrder: 15 });
      expect(res.status).toBe(200);
      expect(res.body.category).toMatchObject({ showOnHome: true, sortOrder: 2, homeSortOrder: 15 });
    });

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

    it('detaches a category from its collection with collectionId:null and nulls its products’ denormalized collection', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'detach' });
      const cat = await makeCategory(col.id);
      const p = await makeProduct(col.id, cat.id);

      const res = await request(app)
        .patch(`/api/categories/${cat.id}`)
        .set(bearer(token))
        .send({ collectionId: null });
      expect(res.status).toBe(200);
      expect(res.body.category.collectionID).toBeNull();

      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.collectionID).toBeNull();
    });

    it('re-linking a category re-syncs its products’ denormalized collection', async () => {
      const { token } = await createAdmin();
      const a = await makeCollection({ slug: 'ra' });
      const b = await makeCollection({ slug: 'rb' });
      const cat = await makeCategory(a.id);
      const p = await makeProduct(a.id, cat.id);

      await request(app)
        .patch(`/api/categories/${cat.id}`)
        .set(bearer(token))
        .send({ collectionId: b.id });

      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.collectionID).toBe(b.id);
    });
  });

  describe('permanently deleting a collection detaches its categories', () => {
    it('leaves the category as standalone (SET NULL, not cascade delete)', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'delcol' });
      const cat = await makeCategory(col.id);

      await request(app).delete(`/api/collections/${col.id}`).set(bearer(token)); // archive first
      const del = await request(app)
        .delete(`/api/collections/${col.id}/permanent`)
        .set(bearer(token));
      expect(del.status).toBe(204);

      const row = await prisma.category.findUnique({ where: { id: cat.id } });
      expect(row).not.toBeNull();
      expect(row?.collectionID).toBeNull();
    });
  });

  describe('DELETE /api/categories/:id (admin) — archives', () => {
    it('archives the category (kept in the DB, hidden from the public list)', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'dc' });
      const cat = await makeCategory(col.id);
      const res = await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.category.archivedAt).not.toBeNull();

      const row = await prisma.category.findUnique({ where: { id: cat.id } });
      expect(row?.archivedAt).not.toBeNull();
      expect(row?.isActive).toBe(false);
    });

    it('restores an archived category', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory(null);
      await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token));
      const res = await request(app).post(`/api/categories/${cat.id}/restore`).set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.category.archivedAt).toBeNull();
      expect(res.body.category.isActive).toBe(true);
    });
  });

  describe('DELETE /api/categories/:id/permanent (admin)', () => {
    it('409s a category that is not archived yet', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory(null);
      const res = await request(app).delete(`/api/categories/${cat.id}/permanent`).set(bearer(token));
      expect(res.status).toBe(409);
    });

    it('permanently deletes an archived, empty category', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory(null);
      await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token)); // archive first
      const res = await request(app).delete(`/api/categories/${cat.id}/permanent`).set(bearer(token));
      expect(res.status).toBe(204);
      expect(await prisma.category.findUnique({ where: { id: cat.id } })).toBeNull();
    });

    it('409s an archived category that still has products', async () => {
      const { token } = await createAdmin();
      const col = await makeCollection({ slug: 'dc2' });
      const cat = await makeCategory(col.id);
      await makeProduct(col.id, cat.id);
      await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token)); // archive first
      const res = await request(app).delete(`/api/categories/${cat.id}/permanent`).set(bearer(token));
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
