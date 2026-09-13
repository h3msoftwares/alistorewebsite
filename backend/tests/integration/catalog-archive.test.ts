import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let adminToken: string;
let customerToken: string;
let categoryId: string;

beforeEach(async () => {
  adminToken = (await createAdmin()).token;
  customerToken = (await createCustomer()).token;
  const cat = await makeCategory();
  categoryId = cat.id;
});

describe('Catalog archive / restore / permanent delete', () => {
  describe('products', () => {
    it('DELETE archives; the public list omits it; status=archived shows it to admin only', async () => {
      const p = await makeProduct(categoryId);

      const del = await request(app).delete(`/api/products/${p.id}`).set(bearer(adminToken));
      expect(del.status).toBe(204);

      const pub = await request(app).get('/api/products');
      expect(pub.body.items.map((x: { id: string }) => x.id)).not.toContain(p.id);

      // 401, not 403 (fix-list.md #5) — no token at all is the textbook 401
      // case, and lets the frontend's existing refresh-and-retry logic fire.
      const anon = await request(app).get('/api/products?status=archived');
      expect(anon.status).toBe(401);

      const asCustomer = await request(app)
        .get('/api/products?status=archived')
        .set(bearer(customerToken));
      expect(asCustomer.status).toBe(403);

      const asAdmin = await request(app)
        .get('/api/products?status=archived')
        .set(bearer(adminToken));
      expect(asAdmin.status).toBe(200);
      expect(asAdmin.body.items.map((x: { id: string }) => x.id)).toContain(p.id);
    });

    it('restore brings a product back to the live list', async () => {
      const p = await makeProduct(categoryId);
      await request(app).delete(`/api/products/${p.id}`).set(bearer(adminToken));

      const res = await request(app).post(`/api/products/${p.id}/restore`).set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.product.deletedAt).toBeNull();

      const pub = await request(app).get('/api/products');
      expect(pub.body.items.map((x: { id: string }) => x.id)).toContain(p.id);
    });

    it('permanent delete: 409 unless archived, 204 for an archived product with no orders', async () => {
      const p = await makeProduct(categoryId);

      const tooSoon = await request(app)
        .delete(`/api/products/${p.id}/permanent`)
        .set(bearer(adminToken));
      expect(tooSoon.status).toBe(409);

      await request(app).delete(`/api/products/${p.id}`).set(bearer(adminToken));
      const ok = await request(app)
        .delete(`/api/products/${p.id}/permanent`)
        .set(bearer(adminToken));
      expect(ok.status).toBe(204);
      expect(await prisma.product.findUnique({ where: { id: p.id } })).toBeNull();
    });

    it('permanent delete: 409 for an archived product that appears in a past order', async () => {
      const p = await makeProduct(categoryId);
      await prisma.order.create({
        data: {
          orderNumber: 'AS-ARCH-1',
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
      await request(app).delete(`/api/products/${p.id}`).set(bearer(adminToken));

      const res = await request(app)
        .delete(`/api/products/${p.id}/permanent`)
        .set(bearer(adminToken));
      expect(res.status).toBe(409);
    });
  });

  describe('collections & categories', () => {
    it('archived collection is hidden from the public list', async () => {
      const col = await makeCollection({ slug: 'summer' });
      await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken));

      const pub = await request(app).get('/api/collections');
      expect(pub.body.collections.map((c: { id: string }) => c.id)).not.toContain(col.id);
    });

    it('anon cannot request status=archived / status=all (401 — fix-list.md #5)', async () => {
      expect((await request(app).get('/api/collections?status=archived')).status).toBe(401);
      expect((await request(app).get('/api/collections?status=all')).status).toBe(401);
      expect((await request(app).get('/api/categories?status=all')).status).toBe(401);
    });

    it('a logged-in customer (valid session, wrong role) still gets 403, not 401', async () => {
      expect(
        (await request(app).get('/api/collections?status=archived').set(bearer(customerToken))).status
      ).toBe(403);
    });

    it('search filters by name / slug (case-insensitive)', async () => {
      await makeCollection({ nameEn: 'Winter Warmers', slug: 'winter-warmers' });
      await makeCollection({ nameEn: 'Beachwear', slug: 'beachwear' });

      const res = await request(app).get('/api/collections?search=winter');
      const slugs = res.body.collections.map((c: { slug: string }) => c.slug);
      expect(slugs).toContain('winter-warmers');
      expect(slugs).not.toContain('beachwear');
    });

    it('an archived collection 404s at its own direct slug URL (fix-list.md #8, resolves 12.1)', async () => {
      const col = await makeCollection({ slug: 'summer' });
      const before = await request(app).get('/api/collections/slug/summer');
      expect(before.status).toBe(200);

      await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken));

      const after = await request(app).get('/api/collections/slug/summer');
      expect(after.status).toBe(404);
    });

    it('an archived category 404s at its own direct slug URL (fix-list.md #8, resolves 12.1)', async () => {
      const cat = await makeCategory({ slug: 'lingerie' });
      const before = await request(app).get('/api/categories/slug/lingerie');
      expect(before.status).toBe(200);

      await request(app).delete(`/api/categories/${cat.id}`).set(bearer(adminToken));

      const after = await request(app).get('/api/categories/slug/lingerie');
      expect(after.status).toBe(404);
    });

    // Re-derivation of fix-list.md #22 (resolves category-reachable-parent-
    // archived) onto the new schema. The ORIGINAL bug and fix were about a
    // category staying reachable when its parent COLLECTION was archived —
    // that relationship no longer exists at all (Category is a pure
    // self-referencing tree now, fully decoupled from Collection; see the
    // Stage 1 catalog redesign). The underlying guarantee this test protects
    // — "a category's own row can look perfectly active while something
    // above it in the hierarchy is archived, and that must still 404, not
    // silently stay reachable" — is re-derived here onto the relationship
    // that now actually carries the hierarchy: an ANCESTOR CATEGORY.
    it('a category 404s at its own slug URL when only an ANCESTOR CATEGORY is archived, not the category itself', async () => {
      const root = await makeCategory({ slug: 'outerwear' });
      const cat = await makeCategory({ slug: 'jackets', parentID: root.id });

      const before = await request(app).get('/api/categories/slug/jackets');
      expect(before.status).toBe(200);

      await request(app).delete(`/api/categories/${root.id}`).set(bearer(adminToken));

      // The descendant's own row is untouched — archiving a category never
      // writes to its descendants — but its slug URL must still 404 now,
      // consistent with the direct-archive case above, instead of staying
      // reachable at a correctly-empty-but-confusing 200.
      const stillActive = await prisma.category.findUniqueOrThrow({ where: { id: cat.id } });
      expect(stillActive.isActive).toBe(true);
      expect(stillActive.archivedAt).toBeNull();

      const after = await request(app).get('/api/categories/slug/jackets');
      expect(after.status).toBe(404);

      // Restoring the ancestor brings the descendant's slug URL back — zero
      // writes to the descendant were needed either time.
      await request(app).post(`/api/categories/${root.id}/restore`).set(bearer(adminToken));
      const restored = await request(app).get('/api/categories/slug/jackets');
      expect(restored.status).toBe(200);
    });

    // The same guarantee, two levels deep — "restoring a parent must make
    // everything under it reappear automatically with zero manual
    // reassignment" (the original kickoff instruction's own wording), not
    // just a direct parent/child pair.
    it('archiving/restoring a category makes a GRANDCHILD category unreachable/reachable too, with no write to the grandchild', async () => {
      const grandparent = await makeCategory({ slug: 'grandparent' });
      const parent = await makeCategory({ slug: 'parent', parentID: grandparent.id });
      const grandchild = await makeCategory({ slug: 'grandchild', parentID: parent.id });

      await request(app).delete(`/api/categories/${grandparent.id}`).set(bearer(adminToken));
      expect((await request(app).get('/api/categories/slug/grandchild')).status).toBe(404);

      const untouched = await prisma.category.findUniqueOrThrow({ where: { id: grandchild.id } });
      expect(untouched.archivedAt).toBeNull();
      expect(untouched.isActive).toBe(true);

      await request(app).post(`/api/categories/${grandparent.id}/restore`).set(bearer(adminToken));
      expect((await request(app).get('/api/categories/slug/grandchild')).status).toBe(200);
    });

    it('a product under an archived category drops out of the public listing/search (fix-list.md #8, resolves 12.6)', async () => {
      const p = await makeProduct(categoryId, { over: { nameEn: 'Findable Widget' } });

      const before = await request(app).get('/api/products?search=Findable');
      expect(before.body.items.map((x: { id: string }) => x.id)).toContain(p.id);

      await request(app).delete(`/api/categories/${categoryId}`).set(bearer(adminToken));

      const after = await request(app).get('/api/products?search=Findable');
      expect(after.body.items.map((x: { id: string }) => x.id)).not.toContain(p.id);

      // The product's own row is untouched — this is the parent's archival
      // state being enforced at listing time, not the product itself.
      const stillActive = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(stillActive.isActive).toBe(true);
      expect(stillActive.deletedAt).toBeNull();

      // Restoring the category brings it back.
      await request(app).post(`/api/categories/${categoryId}/restore`).set(bearer(adminToken));
      const restored = await request(app).get('/api/products?search=Findable');
      expect(restored.body.items.map((x: { id: string }) => x.id)).toContain(p.id);
    });

    // Stage 1's actual architectural point, made concrete: a product's
    // PRIMARY category being archived no longer hides it if the product is
    // still properly reachable through an ADDITIONAL category placement —
    // multi-category placement is the whole reason ProductCategory exists.
    it('a product stays reachable if at least one of its category placements (primary or additional) is not archived', async () => {
      const primary = await makeCategory({ slug: 'primary-archived' });
      const additional = await makeCategory({ slug: 'additional-active' });
      const p = await makeProduct(primary.id, {
        over: { nameEn: 'Dual Placement Widget' },
        additionalCategoryIds: [additional.id],
      });

      await request(app).delete(`/api/categories/${primary.id}`).set(bearer(adminToken));

      const res = await request(app).get('/api/products?search=Dual Placement');
      expect(res.body.items.map((x: { id: string }) => x.id)).toContain(p.id);

      // Once the additional placement is ALSO archived, nothing reachable
      // remains and the product drops out.
      await request(app).delete(`/api/categories/${additional.id}`).set(bearer(adminToken));
      const afterBoth = await request(app).get('/api/products?search=Dual Placement');
      expect(afterBoth.body.items.map((x: { id: string }) => x.id)).not.toContain(p.id);
    });

    // The other half of the same architectural point: Collection is now
    // fully decoupled from the category tree (Stage 1 catalog redesign), so
    // archiving a Collection must NOT affect whether a product is reachable
    // via its categories — unlike the old Collection -> Category -> Product
    // hierarchy, where archiving the top level cut off everything beneath it.
    it('archiving a collection does not affect a product’s reachability via its (unrelated) category', async () => {
      const col = await makeCollection({ slug: 'sale-collection' });
      const p = await makeProduct(categoryId, {
        over: { nameEn: 'Collection Independent Widget' },
        collectionIds: [col.id],
      });

      await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken));

      const res = await request(app).get('/api/products?search=Collection Independent');
      expect(res.body.items.map((x: { id: string }) => x.id)).toContain(p.id);
    });
  });
});
