import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

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
      expect(res.body.collections[0]._count).toEqual({ products: 0 });
      expect(Array.isArray(res.body.collections[0].images)).toBe(true);
    });

    it('includeInactive=true returns hidden collections too (admin only)', async () => {
      await tokens();
      await makeCollection({ slug: 'a-col' });
      await makeCollection({ slug: 'b-col', isActive: false });

      // 401, not 403 (fix-list.md #5, resolves admin-list-403): no token at
      // all is the textbook 401 case, and it's the code the frontend's
      // refresh-and-retry logic watches for — see list-access.ts.
      const anon = await request(app).get('/api/collections?includeInactive=true');
      expect(anon.status).toBe(401);

      // A real, valid session that just isn't staff — genuinely a 403, no
      // retry would ever fix this one.
      const asCustomer = await request(app)
        .get('/api/collections?includeInactive=true')
        .set(bearer(customerToken));
      expect(asCustomer.status).toBe(403);

      const res = await request(app)
        .get('/api/collections?includeInactive=true')
        .set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.collections).toHaveLength(2);
    });

    it('an expired/invalid staff token is treated as no session (401), not a role denial (403)', async () => {
      // optionalAuth swallows a bad token identically to no token at all —
      // this is the actual admin-list-403 scenario: a staff member's
      // short-lived access token quietly expiring mid-session. 401 here is
      // what lets the frontend silently refresh and retry instead of the
      // list just going empty with no explanation.
      const res = await request(app)
        .get('/api/collections?includeInactive=true')
        .set(bearer('not-a-real-token'));
      expect(res.status).toBe(401);
    });

    it('carries showInNav (false by default) + accentColor', async () => {
      await makeCollection({ slug: 'nav-col' });
      const res = await request(app).get('/api/collections');
      expect(res.body.collections[0]).toMatchObject({ showInNav: false, accentColor: null });
    });
  });

  describe('GET /api/collections/:id and /slug/:slug', () => {
    it('returns a collection by id and by slug', async () => {
      const col = await makeCollection({ slug: 'shoes' });

      const byId = await request(app).get(`/api/collections/${col.id}`);
      expect(byId.status).toBe(200);
      expect(byId.body.collection.slug).toBe('shoes');

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

    it('creates a collection (Stage 1: no category relationship at all — Collection is unrelated to the category tree)', async () => {
      await tokens();
      const res = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'New', nameAr: 'جديد', slug: 'new-col' });

      expect(res.status).toBe(201);
      expect(res.body.collection.slug).toBe('new-col');
      expect(res.body.collection.categories).toBeUndefined();
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

    it('showOnHome defaults false and can be set true (independent of showInNav)', async () => {
      await tokens();
      const res = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'Featured', nameAr: 'مميز', slug: 'featured-col', showOnHome: true });
      expect(res.status).toBe(201);
      expect(res.body.collection).toMatchObject({ showOnHome: true, showInNav: false });
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
        .send({ showInNav: true, showOnHome: true, sortOrder: 5, accentColor: '#abcdef' });
      expect(on.body.collection).toMatchObject({
        showInNav: true,
        showOnHome: true,
        sortOrder: 5,
        accentColor: '#abcdef',
      });

      const clear = await request(app)
        .patch(`/api/collections/${col.id}`)
        .set(bearer(adminToken))
        .send({ accentColor: null });
      expect(clear.status).toBe(200);
      expect(clear.body.collection.accentColor).toBeNull();
    });

    it('a single-field PATCH leaves every other curation field untouched', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'r' });
      // Set up a curated collection: in nav AND on the home page, with orders.
      await request(app)
        .patch(`/api/collections/${col.id}`)
        .set(bearer(adminToken))
        .send({ showInNav: true, showOnHome: true, sortOrder: 3, homeSortOrder: 50 });

      // Toggling nav must NOT wipe showOnHome / the orders (Zod .partial()
      // used to re-apply defaults for absent keys).
      const navOff = await request(app)
        .patch(`/api/collections/${col.id}`)
        .set(bearer(adminToken))
        .send({ showInNav: false });
      expect(navOff.body.collection).toMatchObject({
        showInNav: false,
        showOnHome: true,
        sortOrder: 3,
        homeSortOrder: 50,
      });

      // Changing the home order must NOT deselect it from the home page.
      const reorder = await request(app)
        .patch(`/api/collections/${col.id}`)
        .set(bearer(adminToken))
        .send({ homeSortOrder: 10 });
      expect(reorder.body.collection).toMatchObject({
        showOnHome: true,
        sortOrder: 3,
        homeSortOrder: 10,
      });
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

  describe('DELETE /api/collections/:id (admin) — archives', () => {
    it('archives the collection: hidden from the public list, kept in the DB', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'del' });

      const res = await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.collection.archivedAt).not.toBeNull();

      const row = await prisma.collection.findUnique({ where: { id: col.id } });
      expect(row).not.toBeNull();
      expect(row?.archivedAt).not.toBeNull();
      expect(row?.isActive).toBe(false);

      const publicList = await request(app).get('/api/collections');
      expect(publicList.body.collections.map((c: { id: string }) => c.id)).not.toContain(col.id);
    });

    it('restores an archived collection', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'restore-me' });
      await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken));

      const res = await request(app)
        .post(`/api/collections/${col.id}/restore`)
        .set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.collection.archivedAt).toBeNull();
      expect(res.body.collection.isActive).toBe(true);
    });
  });

  describe('DELETE /api/collections/:id/permanent (admin)', () => {
    it('409s a collection that is not archived yet', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'not-archived' });
      const res = await request(app)
        .delete(`/api/collections/${col.id}/permanent`)
        .set(bearer(adminToken));
      expect(res.status).toBe(409);
    });

    it('permanently deletes an archived, empty collection', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'del-perm' });
      await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken)); // archive first

      const res = await request(app)
        .delete(`/api/collections/${col.id}/permanent`)
        .set(bearer(adminToken));
      expect(res.status).toBe(204);
      expect(await prisma.collection.findUnique({ where: { id: col.id } })).toBeNull();
    });

    it('409s when the archived collection still has products', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'has-prod' });
      const cat = await makeCategory();
      await makeProduct(cat.id, { collectionIds: [col.id] });
      await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken)); // archive first

      const res = await request(app)
        .delete(`/api/collections/${col.id}/permanent`)
        .set(bearer(adminToken));
      expect(res.status).toBe(409);
    });
  });

  describe('GET/PUT /api/collections/:id/products (manual membership)', () => {
    it('PUT replaces the collection\'s product membership wholesale', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'sale' });
      const cat = await makeCategory();
      const p1 = await makeProduct(cat.id, { over: { nameEn: 'P1' } });
      const p2 = await makeProduct(cat.id, { over: { nameEn: 'P2' } });

      const res = await request(app)
        .put(`/api/collections/${col.id}/products`)
        .set(bearer(adminToken))
        .send({ productIds: [p1.id, p2.id] });
      expect(res.status).toBe(200);

      const list = await request(app).get(`/api/collections/${col.id}/products`);
      expect(list.status).toBe(200);
      expect(list.body.products.map((p: { id: string }) => p.id).sort()).toEqual([p1.id, p2.id].sort());

      // Replacing again with a smaller set drops the one left out.
      const replace = await request(app)
        .put(`/api/collections/${col.id}/products`)
        .set(bearer(adminToken))
        .send({ productIds: [p1.id] });
      expect(replace.status).toBe(200);
      const list2 = await request(app).get(`/api/collections/${col.id}/products`);
      expect(list2.body.products.map((p: { id: string }) => p.id)).toEqual([p1.id]);
    });

    it('404s if a product id does not exist', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'c' });
      const res = await request(app)
        .put(`/api/collections/${col.id}/products`)
        .set(bearer(adminToken))
        .send({ productIds: ['00000000-0000-4000-8000-000000000000'] });
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

  // Stage 2 of the catalog redesign.
  describe('AUTOMATED / HYBRID collections (CollectionRule)', () => {
    it('defaults to MANUAL, and PUT /:id/products is rejected once switched to AUTOMATED', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'default-manual' });
      expect(col.type).toBe('MANUAL');

      await request(app)
        .patch(`/api/collections/${col.id}`)
        .set(bearer(adminToken))
        .send({ type: 'AUTOMATED' });

      const cat = await makeCategory();
      const product = await makeProduct(cat.id);
      const res = await request(app)
        .put(`/api/collections/${col.id}/products`)
        .set(bearer(adminToken))
        .send({ productIds: [product.id] });
      expect(res.status).toBe(409);
    });

    it('PUT /:id/rules is rejected for a MANUAL collection', async () => {
      await tokens();
      const col = await makeCollection({ slug: 'still-manual' });
      const res = await request(app)
        .put(`/api/collections/${col.id}/rules`)
        .set(bearer(adminToken))
        .send({ rules: [{ groupNumber: 0, field: 'PRICE', operator: 'GREATER_THAN', value: 10 }] });
      expect(res.status).toBe(409);
    });

    it('AUTOMATED: membership comes purely from rules, ignoring any CollectionProduct rows', async () => {
      await tokens();
      const cat = await makeCategory({ slug: 'auto-cat' });
      const cheap = await makeProduct(cat.id, { over: { nameEn: 'Cheap', price: 10 } });
      const pricey = await makeProduct(cat.id, { over: { nameEn: 'Pricey', price: 90 } });

      const col = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'Under 50', nameAr: 'أقل من 50', slug: 'under-50', type: 'AUTOMATED' });
      const colId = col.body.collection.id;

      await request(app)
        .put(`/api/collections/${colId}/rules`)
        .set(bearer(adminToken))
        .send({ rules: [{ groupNumber: 0, field: 'PRICE', operator: 'LESS_THAN', value: 50 }] });

      const res = await request(app).get(`/api/collections/${colId}/products`);
      const ids = res.body.products.map((p: { id: string }) => p.id);
      expect(ids).toEqual([cheap.id]);
      expect(ids).not.toContain(pricey.id);
    });

    it('CATEGORY rule groups: same groupNumber ANDs, different groupNumbers OR', async () => {
      await tokens();
      const cat = await makeCategory({ slug: 'rule-group-cat' });
      // Matches group 0 (price < 50 AND active) only.
      const cheapActive = await makeProduct(cat.id, { over: { nameEn: 'CheapActive', price: 20 } });
      // Matches neither group.
      const pricey = await makeProduct(cat.id, { over: { nameEn: 'Pricey', price: 200 } });
      // Matches group 1 (compareAtPrice > 100) only.
      const onSaleLooking = await makeProduct(cat.id, { over: { nameEn: 'CompareHigh', price: 60, compareAtPrice: 150 } });

      const col = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'Grouped', nameAr: 'مجمّع', slug: 'grouped-rules', type: 'AUTOMATED' });
      const colId = col.body.collection.id;

      await request(app)
        .put(`/api/collections/${colId}/rules`)
        .set(bearer(adminToken))
        .send({
          rules: [
            { groupNumber: 0, field: 'PRICE', operator: 'LESS_THAN', value: 50 },
            { groupNumber: 0, field: 'PRODUCT_STATUS', operator: 'EQUALS', value: 'ACTIVE' },
            { groupNumber: 1, field: 'COMPARE_AT_PRICE', operator: 'GREATER_THAN', value: 100 },
          ],
        });

      const res = await request(app).get(`/api/collections/${colId}/products`);
      const ids = res.body.products.map((p: { id: string }) => p.id).sort();
      expect(ids).toEqual([cheapActive.id, onSaleLooking.id].sort());
      expect(ids).not.toContain(pricey.id);
    });

    it('HYBRID: rules plus manual INCLUDE, minus manual EXCLUDE', async () => {
      await tokens();
      const cat = await makeCategory({ slug: 'hybrid-cat' });
      const matchesRule = await makeProduct(cat.id, { over: { nameEn: 'MatchesRule', price: 20 } });
      const manuallyIncluded = await makeProduct(cat.id, { over: { nameEn: 'ManualInclude', price: 999 } });
      const manuallyExcluded = await makeProduct(cat.id, { over: { nameEn: 'ManualExclude', price: 20 } });

      const col = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'Hybrid', nameAr: 'هجين', slug: 'hybrid-col', type: 'HYBRID' });
      const colId = col.body.collection.id;

      await request(app)
        .put(`/api/collections/${colId}/rules`)
        .set(bearer(adminToken))
        .send({ rules: [{ groupNumber: 0, field: 'PRICE', operator: 'LESS_THAN', value: 50 }] });

      // Manual overlay: explicitly include the pricey one, explicitly
      // exclude the cheap one that would otherwise match the rule.
      await prisma.collectionProduct.createMany({
        data: [
          { collectionID: colId, productID: manuallyIncluded.id, membership: 'INCLUDE' },
          { collectionID: colId, productID: manuallyExcluded.id, membership: 'EXCLUDE' },
        ],
      });

      const res = await request(app).get(`/api/collections/${colId}/products`);
      const ids = res.body.products.map((p: { id: string }) => p.id).sort();
      expect(ids).toEqual([matchesRule.id, manuallyIncluded.id].sort());
      expect(ids).not.toContain(manuallyExcluded.id);
    });

    it("HAS_ACTIVE_PROMOTION EXISTS powers an automated Sale-style collection", async () => {
      await tokens();
      const cat = await makeCategory({ slug: 'sale-rule-cat' });
      const onPromotion = await makeProduct(cat.id, { over: { nameEn: 'OnPromo', price: 40 } });
      const notOnPromotion = await makeProduct(cat.id, { over: { nameEn: 'NotOnPromo', price: 40 } });

      await request(app)
        .post('/api/promotions')
        .set(bearer(adminToken))
        .send({
          nameEn: 'Sale rule promo', nameAr: 'تخفيض', status: 'ACTIVE', type: 'PERCENT', value: 15,
          productIds: [onPromotion.id],
        });

      const col = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'Sale', nameAr: 'تخفيضات', slug: 'auto-sale', type: 'AUTOMATED' });
      const colId = col.body.collection.id;

      await request(app)
        .put(`/api/collections/${colId}/rules`)
        .set(bearer(adminToken))
        .send({ rules: [{ groupNumber: 0, field: 'HAS_ACTIVE_PROMOTION', operator: 'EXISTS' }] });

      const res = await request(app).get(`/api/collections/${colId}/products`);
      const ids = res.body.products.map((p: { id: string }) => p.id);
      expect(ids).toContain(onPromotion.id);
      expect(ids).not.toContain(notOnPromotion.id);
    });

    it('an AUTOMATED collection with no rules yet shows nothing, not "everything"', async () => {
      await tokens();
      await makeProduct((await makeCategory()).id);
      const col = await request(app)
        .post('/api/collections')
        .set(bearer(adminToken))
        .send({ nameEn: 'Empty auto', nameAr: 'فارغة', slug: 'empty-auto', type: 'AUTOMATED' });

      const res = await request(app).get(`/api/collections/${col.body.collection.id}/products`);
      expect(res.body.products).toEqual([]);
    });
  });
});
