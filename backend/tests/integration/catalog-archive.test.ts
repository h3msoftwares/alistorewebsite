import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let adminToken: string;
let customerToken: string;
let collectionId: string;
let categoryId: string;

beforeEach(async () => {
  adminToken = (await createAdmin()).token;
  customerToken = (await createCustomer()).token;
  const col = await makeCollection({ slug: 'root' });
  const cat = await makeCategory(col.id);
  collectionId = col.id;
  categoryId = cat.id;
});

describe('Catalog archive / restore / permanent delete', () => {
  describe('products', () => {
    it('DELETE archives; the public list omits it; status=archived shows it to admin only', async () => {
      const p = await makeProduct(collectionId, categoryId);

      const del = await request(app).delete(`/api/products/${p.id}`).set(bearer(adminToken));
      expect(del.status).toBe(204);

      const pub = await request(app).get('/api/products');
      expect(pub.body.items.map((x: { id: string }) => x.id)).not.toContain(p.id);

      const anon = await request(app).get('/api/products?status=archived');
      expect(anon.status).toBe(403);

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
      const p = await makeProduct(collectionId, categoryId);
      await request(app).delete(`/api/products/${p.id}`).set(bearer(adminToken));

      const res = await request(app).post(`/api/products/${p.id}/restore`).set(bearer(adminToken));
      expect(res.status).toBe(200);
      expect(res.body.product.deletedAt).toBeNull();

      const pub = await request(app).get('/api/products');
      expect(pub.body.items.map((x: { id: string }) => x.id)).toContain(p.id);
    });

    it('permanent delete: 409 unless archived, 204 for an archived product with no orders', async () => {
      const p = await makeProduct(collectionId, categoryId);

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
      const p = await makeProduct(collectionId, categoryId);
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
    it('archived collection is hidden from the public list and nav', async () => {
      const col = await makeCollection({ slug: 'summer', showInNav: true });
      await request(app).delete(`/api/collections/${col.id}`).set(bearer(adminToken));

      const pub = await request(app).get('/api/collections');
      expect(pub.body.collections.map((c: { id: string }) => c.id)).not.toContain(col.id);
    });

    it('anon cannot request status=archived / status=all', async () => {
      expect((await request(app).get('/api/collections?status=archived')).status).toBe(403);
      expect((await request(app).get('/api/collections?status=all')).status).toBe(403);
      expect((await request(app).get('/api/categories?status=all')).status).toBe(403);
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
      const cat = await makeCategory(collectionId, { slug: 'lingerie' });
      const before = await request(app).get('/api/categories/slug/lingerie');
      expect(before.status).toBe(200);

      await request(app).delete(`/api/categories/${cat.id}`).set(bearer(adminToken));

      const after = await request(app).get('/api/categories/slug/lingerie');
      expect(after.status).toBe(404);
    });

    it('a product under an archived category drops out of the public listing/search (fix-list.md #8, resolves 12.6)', async () => {
      const p = await makeProduct(collectionId, categoryId, { over: { nameEn: 'Findable Widget' } });

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

    it('a product under an archived collection (via its category) drops out of the public listing/search', async () => {
      const p = await makeProduct(collectionId, categoryId, { over: { nameEn: 'Collection Widget' } });

      const before = await request(app).get('/api/products?search=Collection Widget');
      expect(before.body.items.map((x: { id: string }) => x.id)).toContain(p.id);

      await request(app).delete(`/api/collections/${collectionId}`).set(bearer(adminToken));

      const after = await request(app).get('/api/products?search=Collection Widget');
      expect(after.body.items.map((x: { id: string }) => x.id)).not.toContain(p.id);
    });

    it('a product under a standalone (no-collection) category is unaffected by this check', async () => {
      const standaloneCat = await makeCategory(null, { slug: 'standalone-cat' });
      const p = await makeProduct(null, standaloneCat.id, { over: { nameEn: 'Standalone Widget' } });

      const res = await request(app).get('/api/products?search=Standalone Widget');
      expect(res.body.items.map((x: { id: string }) => x.id)).toContain(p.id);
    });
  });
});
