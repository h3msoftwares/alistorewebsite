import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

describe('Categories API', () => {
  describe('GET /api/categories', () => {
    it('lists active categories, optionally filtered by parentId', async () => {
      const root = await makeCategory({ nameEn: 'Root' });
      await makeCategory({ nameEn: 'A-cat', parentID: root.id });
      await makeCategory({ nameEn: 'B-cat' });
      await makeCategory({ nameEn: 'Inactive', isActive: false });

      const all = await request(app).get('/api/categories');
      expect(all.status).toBe(200);
      // Root + B-cat are top-level; A-cat is root's child, also returned by
      // the unfiltered list (no parentId/topLevel given).
      expect(all.body.categories.map((c: { nameEn: string }) => c.nameEn).sort()).toEqual(
        ['A-cat', 'B-cat', 'Root'].sort()
      );

      const filtered = await request(app).get(`/api/categories?parentId=${root.id}`);
      expect(filtered.body.categories).toHaveLength(1);
      expect(filtered.body.categories[0].nameEn).toBe('A-cat');
      expect(filtered.body.categories[0].parentID).toBe(root.id);
    });

    it('?topLevel=true returns only root categories', async () => {
      const root = await makeCategory({ nameEn: 'Top' });
      await makeCategory({ nameEn: 'Child', parentID: root.id });

      const res = await request(app).get('/api/categories?topLevel=true');
      expect(res.status).toBe(200);
      expect(res.body.categories.map((c: { nameEn: string }) => c.nameEn)).toEqual(['Top']);
    });

    it('?showOnHome=true returns featured categories across the whole tree', async () => {
      const root = await makeCategory({ nameEn: 'Root' });
      await makeCategory({ nameEn: 'Featured A', showOnHome: true });
      await makeCategory({ nameEn: 'Featured child', showOnHome: true, parentID: root.id });
      await makeCategory({ nameEn: 'Not featured', showOnHome: false });

      const res = await request(app).get('/api/categories?showOnHome=true');
      expect(res.status).toBe(200);
      expect(res.body.categories.map((c: { nameEn: string }) => c.nameEn).sort()).toEqual(
        ['Featured A', 'Featured child'].sort()
      );
    });

    it('every category carries a computed isEffectivelyArchived flag (own or ancestor archived)', async () => {
      const { token } = await createAdmin();
      const root = await makeCategory({ nameEn: 'Root' });
      const child = await makeCategory({ nameEn: 'Child', parentID: root.id });

      await request(app).delete(`/api/categories/${root.id}`).set(bearer(token));

      const res = await request(app).get('/api/categories?status=all').set(bearer(token));
      const byId = new Map(res.body.categories.map((c: { id: string }) => [c.id, c]));
      expect((byId.get(root.id) as { isEffectivelyArchived: boolean }).isEffectivelyArchived).toBe(true);
      // The child's OWN archivedAt is still null, but it's effectively
      // archived because its parent is.
      const childRow = await prisma.category.findUniqueOrThrow({ where: { id: child.id } });
      expect(childRow.archivedAt).toBeNull();
      expect((byId.get(child.id) as { isEffectivelyArchived: boolean }).isEffectivelyArchived).toBe(true);
    });
  });

  describe('GET /api/categories/slug/:slug', () => {
    it('returns one category by slug', async () => {
      await makeCategory({ slug: 'clearance' });
      const res = await request(app).get('/api/categories/slug/clearance');
      expect(res.status).toBe(200);
      expect(res.body.category.slug).toBe('clearance');
    });

    it('404s an unknown slug', async () => {
      const res = await request(app).get('/api/categories/slug/nope');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/categories/:id/products (preview)', () => {
    it('returns the shaped, paginated product list scoped to the category', async () => {
      const cat = await makeCategory({ slug: 'preview-cat' });
      await makeProduct(cat.id, { over: { nameEn: 'P1', price: 10 } });
      await makeProduct(cat.id, { over: { nameEn: 'P2', price: 20, saleType: 'PERCENT', saleValue: 50 } });
      // a product in a different category must not leak in
      const other = await makeCategory({ slug: 'other-cat' });
      await makeProduct(other.id);

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

    // Regression: browsing a category means browsing its whole subtree — a
    // root like "Women" typically has no products placed on it directly,
    // only on its leaf categories (Lingerie, Nightwear, ...). The listing
    // used to match category id EXACTLY (primary or additional placement),
    // so a root category page came back empty even though its descendants
    // were full of products.
    it('includes products placed on descendant categories, not just the category itself', async () => {
      const root = await makeCategory({ nameEn: 'Root', slug: 'desc-root' });
      const child = await makeCategory({ nameEn: 'Child', slug: 'desc-child', parentID: root.id });
      const grandchild = await makeCategory({ nameEn: 'Grandchild', slug: 'desc-grandchild', parentID: child.id });
      await makeProduct(grandchild.id, { over: { nameEn: 'Deep product' } });
      // an unrelated sibling subtree must not leak in
      const other = await makeCategory({ nameEn: 'Other root', slug: 'desc-other' });
      await makeProduct(other.id, { over: { nameEn: 'Unrelated product' } });

      const res = await request(app).get(`/api/categories/${root.id}/products`);
      expect(res.status).toBe(200);
      expect(res.body.items.map((p: { nameEn: string }) => p.nameEn)).toEqual(['Deep product']);

      // Browsing the intermediate child also finds the grandchild's product.
      const childRes = await request(app).get(`/api/categories/${child.id}/products`);
      expect(childRes.body.items.map((p: { nameEn: string }) => p.nameEn)).toEqual(['Deep product']);
    });
  });

  describe('GET /api/categories/:id', () => {
    it('returns one category with images + children', async () => {
      const parent = await makeCategory({ nameEn: 'Parent' });
      await makeCategory({ nameEn: 'Child', parentID: parent.id });

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
      const body = { nameEn: 'N', nameAr: 'N', slug: 'n-cat' };

      expect((await request(app).post('/api/categories').send(body)).status).toBe(401);

      const { token } = await createCustomer();
      expect(
        (await request(app).post('/api/categories').set(bearer(token)).send(body)).status
      ).toBe(403);
    });

    it('creates a root category with path "/slug/" and depth 0', async () => {
      const { token } = await createAdmin();
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ nameEn: 'Clearance', nameAr: 'تصفية', slug: 'clearance' });
      expect(res.status).toBe(201);
      expect(res.body.category).toMatchObject({ slug: 'clearance', parentID: null, path: '/clearance/', depth: 0 });
    });

    it('creates a nested category under an existing parent, computing path/depth', async () => {
      const { token } = await createAdmin();
      const parent = await makeCategory({ slug: 'men' });
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ nameEn: 'Hats', nameAr: 'قبعات', slug: 'hats', parentId: parent.id });
      expect(res.status).toBe(201);
      expect(res.body.category).toMatchObject({ parentID: parent.id, path: '/men/hats/', depth: 1 });
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

    it('404s when the parent category does not exist', async () => {
      const { token } = await createAdmin();
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ nameEn: 'H', nameAr: 'H', slug: 'h-cat', parentId: UNKNOWN });
      expect(res.status).toBe(404);
    });

    it('409s a duplicate slug', async () => {
      const { token } = await createAdmin();
      await makeCategory({ slug: 'taken' });
      const res = await request(app)
        .post('/api/categories')
        .set(bearer(token))
        .send({ nameEn: 'T', nameAr: 'T', slug: 'taken' });
      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /api/categories/:id (admin)', () => {
    it('changing homeSortOrder does not deselect the category from the home page', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory();
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

    it('re-parents a category, recomputing its own path/depth', async () => {
      const { token } = await createAdmin();
      const a = await makeCategory({ slug: 'branch-a' });
      const b = await makeCategory({ slug: 'branch-b' });
      const cat = await makeCategory({ slug: 'movable', parentID: a.id });

      const res = await request(app)
        .patch(`/api/categories/${cat.id}`)
        .set(bearer(token))
        .send({ parentId: b.id });
      expect(res.status).toBe(200);
      expect(res.body.category).toMatchObject({ parentID: b.id, path: '/branch-b/movable/', depth: 1 });
    });

    it('detaches a category to the top level with parentId:null', async () => {
      const { token } = await createAdmin();
      const parent = await makeCategory({ slug: 'was-parent' });
      const cat = await makeCategory({ slug: 'detachable', parentID: parent.id });

      const res = await request(app)
        .patch(`/api/categories/${cat.id}`)
        .set(bearer(token))
        .send({ parentId: null });
      expect(res.status).toBe(200);
      expect(res.body.category).toMatchObject({ parentID: null, path: '/detachable/', depth: 0 });
    });

    it('400s a category set as its own parent', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory({ slug: 'self' });
      const res = await request(app)
        .patch(`/api/categories/${cat.id}`)
        .set(bearer(token))
        .send({ parentId: cat.id });
      expect(res.status).toBe(400);
    });

    it('400s re-parenting a category under its own descendant (cycle)', async () => {
      const { token } = await createAdmin();
      const grandparent = await makeCategory({ slug: 'gp' });
      const parent = await makeCategory({ slug: 'p', parentID: grandparent.id });
      const child = await makeCategory({ slug: 'c', parentID: parent.id });

      const res = await request(app)
        .patch(`/api/categories/${grandparent.id}`)
        .set(bearer(token))
        .send({ parentId: child.id });
      expect(res.status).toBe(400);

      // Rejected — the tree is untouched.
      const row = await prisma.category.findUniqueOrThrow({ where: { id: grandparent.id } });
      expect(row.parentID).toBeNull();
    });

    it('renaming a mid-tree category (with a child AND a grandchild) cascades path/depth at every level in one operation', async () => {
      const { token } = await createAdmin();
      const root = await makeCategory({ slug: 'women' });
      const mid = await makeCategory({ slug: 'shoes', parentID: root.id });
      const child = await makeCategory({ slug: 'sport-shoes', parentID: mid.id });
      const grandchild = await makeCategory({ slug: 'running-shoes', parentID: child.id });

      const res = await request(app)
        .patch(`/api/categories/${mid.id}`)
        .set(bearer(token))
        .send({ slug: 'shoes-renamed' });
      expect(res.status).toBe(200);
      expect(res.body.category.path).toBe('/women/shoes-renamed/');

      const childRow = await prisma.category.findUniqueOrThrow({ where: { id: child.id } });
      expect(childRow.path).toBe('/women/shoes-renamed/sport-shoes/');
      expect(childRow.depth).toBe(2);

      const grandchildRow = await prisma.category.findUniqueOrThrow({ where: { id: grandchild.id } });
      expect(grandchildRow.path).toBe('/women/shoes-renamed/sport-shoes/running-shoes/');
      expect(grandchildRow.depth).toBe(3);
    });
  });

  describe('DELETE /api/categories/:id (admin) — archives', () => {
    it('archives the category (kept in the DB, hidden from the public list)', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory();
      const res = await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.category.archivedAt).not.toBeNull();

      const row = await prisma.category.findUnique({ where: { id: cat.id } });
      expect(row?.archivedAt).not.toBeNull();
      expect(row?.isActive).toBe(false);
    });

    it('restores an archived category', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory();
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
      const cat = await makeCategory();
      const res = await request(app).delete(`/api/categories/${cat.id}/permanent`).set(bearer(token));
      expect(res.status).toBe(409);
    });

    it('permanently deletes an archived, empty category', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory();
      await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token)); // archive first
      const res = await request(app).delete(`/api/categories/${cat.id}/permanent`).set(bearer(token));
      expect(res.status).toBe(204);
      expect(await prisma.category.findUnique({ where: { id: cat.id } })).toBeNull();
    });

    it('409s an archived category that still has products (primary placement)', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory();
      await makeProduct(cat.id);
      await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token)); // archive first
      const res = await request(app).delete(`/api/categories/${cat.id}/permanent`).set(bearer(token));
      expect(res.status).toBe(409);
    });

    it('409s an archived category that still has products (additional placement only)', async () => {
      const { token } = await createAdmin();
      const primary = await makeCategory({ slug: 'primary-home' });
      const additional = await makeCategory({ slug: 'additional-home' });
      await makeProduct(primary.id, { additionalCategoryIds: [additional.id] });
      await request(app).delete(`/api/categories/${additional.id}`).set(bearer(token));
      const res = await request(app).delete(`/api/categories/${additional.id}/permanent`).set(bearer(token));
      expect(res.status).toBe(409);
    });

    // Corrects the old "SetNull, orphan to a new root" policy this test used
    // to verify (recorded as "Pass" under TEST_PLAN.md 4.5 / reports/
    // results.md — see backend/prisma/migrations/20260912000000's category
    // FK, now onDelete: RESTRICT). Deleting a category with dependents
    // (products OR child categories) without an explicit reassignment first
    // is the same inconsistency this codebase already rejects for products;
    // there's no principled reason child categories should be exempt from a
    // rule products are already held to. The old test recorded a policy
    // choice as correct, not a fixed guarantee — corrected here on its own
    // merits, not reconciled against.
    it('409s an archived category that still has a child category, instead of silently orphaning it to a new root', async () => {
      const { token } = await createAdmin();
      const parent = await makeCategory({ slug: 'has-child' });
      const child = await makeCategory({ slug: 'the-child', parentID: parent.id });
      await request(app).delete(`/api/categories/${parent.id}`).set(bearer(token)); // archive first

      const res = await request(app).delete(`/api/categories/${parent.id}/permanent`).set(bearer(token));
      expect(res.status).toBe(409);

      // The tree is untouched — child still points at its (archived) parent.
      const childRow = await prisma.category.findUniqueOrThrow({ where: { id: child.id } });
      expect(childRow.parentID).toBe(parent.id);

      // Deleting the child first, then the parent, succeeds.
      await request(app).delete(`/api/categories/${child.id}`).set(bearer(token));
      const delChild = await request(app).delete(`/api/categories/${child.id}/permanent`).set(bearer(token));
      expect(delChild.status).toBe(204);
      const delParent = await request(app).delete(`/api/categories/${parent.id}/permanent`).set(bearer(token));
      expect(delParent.status).toBe(204);
    });
  });

  describe('Category images (admin sub-resource)', () => {
    it('adds / updates / deletes', async () => {
      const { token } = await createAdmin();
      const cat = await makeCategory();

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
