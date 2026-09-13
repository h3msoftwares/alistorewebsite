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
  const cat = await makeCategory();
  collectionId = col.id;
  categoryId = cat.id;
  adminToken = (await createAdmin()).token;
});

const productBody = (over: Record<string, unknown> = {}) => ({
  sku: 'SKU-1',
  nameEn: 'Tee',
  nameAr: 'تيشيرت',
  primaryCategoryId: categoryId,
  price: 20,
  variants: [{ sku: 'SKU-1-M', size: 'M', color: 'Black', stockQuantity: 5 }],
  ...over,
});

describe('Products API', () => {
  describe('GET /api/products (list + filters)', () => {
    it('returns active products with pagination envelope', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'Alpha', price: 10 } });
      await makeProduct(categoryId, { over: { nameEn: 'Beta', price: 30 } });

      const res = await request(app).get('/api/products?pageSize=1&page=1');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(res.body.items).toHaveLength(1);
    });

    it('filters by price range and sorts', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'Cheap', price: 5 } });
      await makeProduct(categoryId, { over: { nameEn: 'Mid', price: 25 } });
      await makeProduct(categoryId, { over: { nameEn: 'Pricey', price: 90 } });

      const res = await request(app).get('/api/products?minPrice=10&maxPrice=50&sort=price_desc');
      expect(res.body.items.map((p: { nameEn: string }) => p.nameEn)).toEqual(['Mid']);
    });

    it('paginates a tied sort key stably — every row appears exactly once across pages, none repeated or skipped (fix-list.md #19, resolves 11.6)', async () => {
      // 6 products, all the same price — the exact shape that used to have
      // no deterministic order at all (Postgres doesn't guarantee stable
      // row order across repeated queries for tied sort keys without a
      // tiebreaker column).
      const ids = new Set<string>();
      for (let i = 0; i < 6; i++) {
        const p = await makeProduct(categoryId, { over: { nameEn: `Tied ${i}`, price: 20 } });
        ids.add(p.id);
      }

      const page1 = await request(app).get('/api/products?sort=price_asc&page=1&pageSize=3');
      const page2 = await request(app).get('/api/products?sort=price_asc&page=2&pageSize=3');
      const seen = [...page1.body.items, ...page2.body.items].map((p: { id: string }) => p.id);

      expect(seen).toHaveLength(6);
      expect(new Set(seen)).toEqual(ids); // every row exactly once — none skipped, none repeated

      // Re-fetching the same two pages again returns identical order —
      // stability across repeated requests, not just within one.
      const page1Again = await request(app).get('/api/products?sort=price_asc&page=1&pageSize=3');
      expect(page1Again.body.items.map((p: { id: string }) => p.id)).toEqual(
        page1.body.items.map((p: { id: string }) => p.id)
      );
    });

    it('filters by search term and by variant size', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'Red Hoodie' } });
      await makeProduct(categoryId, {
        over: { nameEn: 'Blue Cap' },
        variants: [{ size: 'L', color: 'Blue', stockQuantity: 2 }],
      });

      expect((await request(app).get('/api/products?search=hoodie')).body.items).toHaveLength(1);
      expect((await request(app).get('/api/products?size=L')).body.items).toHaveLength(1);
    });

    it('hides soft-deleted products from the public list', async () => {
      const p = await makeProduct(categoryId);
      await prisma.product.update({
        where: { id: p.id },
        data: { isActive: false, deletedAt: new Date() },
      });
      const res = await request(app).get('/api/products');
      expect(res.body.items).toHaveLength(0);
    });

    it('sort=best_selling ranks by units sold in the last 90 days, cancelled orders excluded', async () => {
      const mk = (name: string) =>
        makeProduct(categoryId, {
          over: { nameEn: name },
          variants: [{ sku: `${name}-v`, size: 'M', color: 'Black', stockQuantity: 50 }],
        });
      const [top, mid, none, cancelled] = await Promise.all([
        mk('Top'),
        mk('Mid'),
        mk('None'),
        mk('Cancelled'),
      ]);

      const orderItem = (p: Awaited<ReturnType<typeof mk>>, qty: number, when: Date) => ({
        orderNumber: `AS-${p.nameEn}-${when.getTime()}`,
        deliveryName: 'x',
        deliveryPhone: '123456',
        deliveryAddress: 's',
        deliveryCity: 'c',
        subtotal: 1,
        total: 1,
        dateCreated: when,
        items: {
          create: {
            variantID: p.variants[0].id,
            productName: p.nameEn,
            productSKU: p.sku,
            variantSKU: p.variants[0].sku,
            quantity: qty,
            unitPrice: 1,
            lineTotal: qty,
          },
        },
      });
      const recent = new Date();
      const stale = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);

      await prisma.order.create({ data: orderItem(top, 8, recent) });
      await prisma.order.create({ data: orderItem(mid, 3, recent) });
      await prisma.order.create({ data: orderItem(none, 20, stale) }); // outside the window
      await prisma.order.create({
        data: { ...orderItem(cancelled, 99, recent), status: 'CANCELLED' },
      });

      const res = await request(app).get('/api/products?sort=best_selling');
      expect(res.status).toBe(200);
      const names = res.body.items.map((p: { nameEn: string }) => p.nameEn);
      // Only Top and Mid have qualifying recent sales, most units first.
      expect(names.slice(0, 2)).toEqual(['Top', 'Mid']);
      expect(res.body.total).toBe(2);
    });

    it('sort=best_selling falls back to newest when nothing has sold', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'First' } });
      await new Promise((r) => setTimeout(r, 10));
      await makeProduct(categoryId, { over: { nameEn: 'Second' } });
      const res = await request(app).get('/api/products?sort=best_selling');
      expect(res.status).toBe(200);
      expect(res.body.items.map((p: { nameEn: string }) => p.nameEn)).toEqual(['Second', 'First']);
    });
  });

  // Regression: this is the storefront's ACTUAL collection-page code path
  // (CollectionProducts -> useProducts({ collectionId }) -> GET /api/products
  // ?collectionId=), a completely different route from the admin-facing
  // GET /api/collections/:id/products preview. The collectionId filter used
  // to check the CollectionProduct join table unconditionally, so an
  // AUTOMATED or HYBRID collection (computed from CollectionRule) always
  // came back empty here even though the dedicated preview endpoint resolved
  // it correctly — caught by manually browsing the real storefront page, not
  // by curling the preview endpoint alone.
  describe('GET /api/products?collectionId= (collection membership by type)', () => {
    it('MANUAL: only products with a CollectionProduct row for this collection', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'In' }, collectionIds: [collectionId] });
      await makeProduct(categoryId, { over: { nameEn: 'Out' } });

      const res = await request(app).get(`/api/products?collectionId=${collectionId}`);
      expect(res.body.items.map((p: { nameEn: string }) => p.nameEn)).toEqual(['In']);
    });

    it('AUTOMATED: membership computed from CollectionRule, ignoring CollectionProduct rows entirely', async () => {
      const automated = await makeCollection({ slug: 'auto', type: 'AUTOMATED' });
      await makeProduct(categoryId, { over: { nameEn: 'Cheap', price: 10 } });
      await makeProduct(categoryId, { over: { nameEn: 'Pricey', price: 50 } });
      await prisma.collectionRule.create({
        data: { collectionID: automated.id, groupNumber: 0, field: 'PRICE', operator: 'GREATER_THAN_OR_EQUAL', value: 30 },
      });

      const res = await request(app).get(`/api/products?collectionId=${automated.id}`);
      expect(res.body.items.map((p: { nameEn: string }) => p.nameEn)).toEqual(['Pricey']);
    });

    it('HYBRID: rule match OR manual INCLUDE, minus manual EXCLUDE', async () => {
      const hybrid = await makeCollection({ slug: 'hyb', type: 'HYBRID' });
      await makeProduct(categoryId, { over: { nameEn: 'Matches', price: 50 } });
      const forcedIn = await makeProduct(categoryId, { over: { nameEn: 'ForcedIn', price: 5 } });
      const forcedOut = await makeProduct(categoryId, { over: { nameEn: 'ForcedOut', price: 50 } });
      await prisma.collectionRule.create({
        data: { collectionID: hybrid.id, groupNumber: 0, field: 'PRICE', operator: 'GREATER_THAN_OR_EQUAL', value: 30 },
      });
      await prisma.collectionProduct.create({
        data: { collectionID: hybrid.id, productID: forcedIn.id, membership: 'INCLUDE' },
      });
      await prisma.collectionProduct.create({
        data: { collectionID: hybrid.id, productID: forcedOut.id, membership: 'EXCLUDE' },
      });

      const res = await request(app).get(`/api/products?collectionId=${hybrid.id}`);
      expect(res.body.items.map((p: { nameEn: string }) => p.nameEn).sort()).toEqual(['ForcedIn', 'Matches']);
    });
  });

  // Backs the header type-ahead (frontend SearchOverlay -> useProducts({ search, pageSize })).
  describe('GET /api/products — catalogue search', () => {
    const names = (res: { body: { items: { nameEn: string }[] } }) =>
      res.body.items.map((p) => p.nameEn).sort();

    beforeEach(async () => {
      await makeProduct(categoryId, {
        over: { nameEn: 'Satin Nightgown', nameAr: 'قميص نوم ساتان' },
      });
      await makeProduct(categoryId, {
        over: { nameEn: 'Satin Robe', nameAr: 'روب ساتان' },
      });
      await makeProduct(categoryId, {
        over: { nameEn: 'Cotton Boxer 3-Pack', nameAr: 'بوكسر قطن' },
      });
    });

    it('matches a case-insensitive substring of the English name', async () => {
      const res = await request(app).get('/api/products?search=NIGHT');
      expect(names(res)).toEqual(['Satin Nightgown']);
    });

    it('matches on the Arabic name too', async () => {
      const res = await request(app).get(`/api/products?search=${encodeURIComponent('روب')}`);
      expect(names(res)).toEqual(['Satin Robe']);
    });

    it('returns every match, with total reflecting the full count even when a page is smaller', async () => {
      const res = await request(app).get('/api/products?search=satin&pageSize=1');
      expect(res.body.total).toBe(2);
      expect(res.body.items).toHaveLength(1);
    });

    it('returns an empty envelope (not an error) when nothing matches', async () => {
      const res = await request(app).get('/api/products?search=nothinghere');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    });

    it('never surfaces a soft-deleted product in results', async () => {
      const gone = await makeProduct(categoryId, { over: { nameEn: 'Satin Wrap' } });
      await prisma.product.update({
        where: { id: gone.id },
        data: { isActive: false, deletedAt: new Date() },
      });
      const res = await request(app).get('/api/products?search=satin');
      expect(names(res)).toEqual(['Satin Nightgown', 'Satin Robe']);
    });

    it('treats an empty search= as no filter', async () => {
      const res = await request(app).get('/api/products?search=');
      expect(res.body.total).toBe(3);
    });

    it('ignores punctuation and spacing: "tshirt" / "t shirt" find "T-Shirt"', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'Classic T-Shirt', nameAr: 'تيشيرت كلاسيكي' } });
      for (const term of ['tshirt', 't-shirt', 't shirt', 'T-SHIRT']) {
        expect(names(await request(app).get(`/api/products?search=${encodeURIComponent(term)}`))).toEqual(
          ['Classic T-Shirt'],
        );
      }
    });

    it('matches across singular/plural ("tshirts" → "T-Shirt", "boxer" → "…Boxer 3-Pack")', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'Classic T-Shirt', nameAr: 'تيشيرت' } });
      expect(names(await request(app).get('/api/products?search=tshirts'))).toEqual(['Classic T-Shirt']);
      expect(names(await request(app).get('/api/products?search=boxers'))).toEqual(['Cotton Boxer 3-Pack']);
    });

    it('matches "by meaning" via apparel synonyms ("tee" → "T-Shirt", "pants" → "Trousers")', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'Classic T-Shirt', nameAr: 'تيشيرت' } });
      await makeProduct(categoryId, { over: { nameEn: 'Chino Trousers', nameAr: 'بنطلون تشينو' } });
      expect(names(await request(app).get('/api/products?search=tee'))).toEqual(['Classic T-Shirt']);
      expect(names(await request(app).get('/api/products?search=pants'))).toEqual(['Chino Trousers']);
    });

    it('still narrows on every word — "red hoodie" excludes a blue one', async () => {
      await makeProduct(categoryId, { over: { nameEn: 'Red Hoodie', nameAr: 'هودي أحمر' } });
      await makeProduct(categoryId, { over: { nameEn: 'Blue Hoodie', nameAr: 'هودي أزرق' } });
      expect(names(await request(app).get('/api/products?search=red%20hoodie'))).toEqual(['Red Hoodie']);
    });

    it('does not leak the internal searchText field in the response', async () => {
      const res = await request(app).get('/api/products?search=satin');
      expect(res.body.items.length).toBeGreaterThan(0);
      for (const item of res.body.items) expect(item).not.toHaveProperty('searchText');
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns a product with variants/images/primaryCategory', async () => {
      const p = await makeProduct(categoryId);
      const res = await request(app).get(`/api/products/${p.id}`);
      expect(res.status).toBe(200);
      expect(res.body.product.variants).toHaveLength(1);
      expect(res.body.product.primaryCategory.id).toBe(categoryId);
    });

    it('404s the public on an inactive product but an admin can still fetch it', async () => {
      const p = await makeProduct(categoryId);
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

    it('creates a product with variants under its primary category', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody());
      expect(res.status).toBe(201);
      expect(res.body.product.variants).toHaveLength(1);
      expect(res.body.product.primaryCategoryID).toBe(categoryId);
      expect(res.body.product.primaryCategory.slug).toBe(
        (await prisma.category.findUniqueOrThrow({ where: { id: categoryId } })).slug
      );
    });

    // The core Stage 1 catalog-redesign capability: one primary category
    // (canonical URL/breadcrumbs/reporting) plus additional, non-canonical
    // placements — see robust-ecommerce-catalog-architecture.md's "Why a
    // primary category matters".
    it('creates a product with a primary category plus additional category placements', async () => {
      const additional1 = await makeCategory({ slug: 'also-here-1' });
      const additional2 = await makeCategory({ slug: 'also-here-2' });
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ additionalCategoryIds: [additional1.id, additional2.id] }));
      expect(res.status).toBe(201);
      expect(res.body.product.primaryCategoryID).toBe(categoryId);
      const linkedIds = res.body.product.categoryLinks.map((l: { categoryID: string }) => l.categoryID).sort();
      expect(linkedIds).toEqual([additional1.id, additional2.id].sort());

      // The category page for an ADDITIONAL placement also lists the product
      // (not just the primary one) — that's the whole point of the link.
      const viaAdditional = await request(app).get(`/api/categories/${additional1.id}/products`);
      expect(viaAdditional.body.items.map((p: { id: string }) => p.id)).toContain(res.body.product.id);
    });

    it('silently dedupes an additionalCategoryIds entry that repeats the primary category', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ additionalCategoryIds: [categoryId] }));
      expect(res.status).toBe(201);
      expect(res.body.product.categoryLinks).toHaveLength(0);
    });

    it('creates a product with manual collection membership', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ collectionIds: [collectionId] }));
      expect(res.status).toBe(201);
      expect(res.body.product.collectionLinks.map((l: { collectionID: string }) => l.collectionID)).toEqual([
        collectionId,
      ]);
    });

    it('409s assigning a product to an archived category', async () => {
      await request(app).delete(`/api/categories/${categoryId}`).set(bearer(adminToken));
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody());
      expect(res.status).toBe(409);
    });

    it('409s assigning a product to an archived collection', async () => {
      await request(app).delete(`/api/collections/${collectionId}`).set(bearer(adminToken));
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ collectionIds: [collectionId] }));
      expect(res.status).toBe(409);
    });

    it('PATCH replaces additionalCategoryIds/collectionIds wholesale, leaving them untouched when omitted', async () => {
      const additional = await makeCategory({ slug: 'orig-additional' });
      const created = (
        await request(app)
          .post('/api/products')
          .set(bearer(adminToken))
          .send(productBody({ additionalCategoryIds: [additional.id], collectionIds: [collectionId] }))
      ).body.product;

      // Omitting both fields entirely leaves the existing placements alone.
      const untouched = await request(app)
        .patch(`/api/products/${created.id}`)
        .set(bearer(adminToken))
        .send({ nameEn: 'Renamed Only' });
      expect(untouched.status).toBe(200);
      expect(untouched.body.product.categoryLinks).toHaveLength(1);
      expect(untouched.body.product.collectionLinks).toHaveLength(1);

      // Explicitly sending an empty array clears them.
      const cleared = await request(app)
        .patch(`/api/products/${created.id}`)
        .set(bearer(adminToken))
        .send({ additionalCategoryIds: [], collectionIds: [] });
      expect(cleared.status).toBe(200);
      expect(cleared.body.product.categoryLinks).toHaveLength(0);
      expect(cleared.body.product.collectionLinks).toHaveLength(0);
    });

    it('moving a product to another primary category updates primaryCategoryID', async () => {
      const otherCat = await makeCategory();
      const created = (
        await request(app).post('/api/products').set(bearer(adminToken)).send(productBody())
      ).body.product;

      const res = await request(app)
        .patch(`/api/products/${created.id}`)
        .set(bearer(adminToken))
        .send({ primaryCategoryId: otherCat.id });
      expect(res.status).toBe(200);
      expect(res.body.product.primaryCategoryID).toBe(otherCat.id);
    });

    it('404s when the primary category does not exist', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ primaryCategoryId: UNKNOWN }));
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
      const p = await makeProduct(categoryId);
      const res = await request(app)
        .patch(`/api/products/${p.id}`)
        .set(bearer(adminToken))
        .send({ nameEn: 'Renamed', price: 99 });
      expect(res.status).toBe(200);
      expect(res.body.product).toMatchObject({ nameEn: 'Renamed' });
      expect(Number(res.body.product.price)).toBe(99);
    });

    it('without expectedLastEdit, a second concurrent edit still silently wins (unchanged, backward-compatible default)', async () => {
      const p = await makeProduct(categoryId, { over: { price: 10 } });
      const tabA = await request(app).patch(`/api/products/${p.id}`).set(bearer(adminToken)).send({ price: 50 });
      const tabB = await request(app).patch(`/api/products/${p.id}`).set(bearer(adminToken)).send({ price: 60 });
      expect(tabA.status).toBe(200);
      expect(tabB.status).toBe(200);
      const final = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(Number(final.price)).toBe(60);
    });

    it('409s a concurrent edit when expectedLastEdit is stale (fix-list.md #14, resolves 1.5)', async () => {
      const p = await makeProduct(categoryId, { over: { price: 10 } });
      const fetched = await request(app).get(`/api/products/${p.id}`);
      const staleLastEdit = fetched.body.product.lastEdit;

      // Tab A saves first, using the same lastEdit both tabs loaded with.
      const tabA = await request(app)
        .patch(`/api/products/${p.id}`)
        .set(bearer(adminToken))
        .send({ price: 50, expectedLastEdit: staleLastEdit });
      expect(tabA.status).toBe(200);

      // Tab B still has the OLD lastEdit (never refetched) — its save must
      // be rejected instead of silently overwriting tab A's change.
      const tabB = await request(app)
        .patch(`/api/products/${p.id}`)
        .set(bearer(adminToken))
        .send({ price: 60, expectedLastEdit: staleLastEdit });
      expect(tabB.status).toBe(409);
      // Distinct from the plain CONFLICT a rejected category/collection
      // assignment uses (see the archived-category tests below) — the
      // frontend needs to tell a genuine stale-edit race apart from every
      // other 409 without string-matching the message.
      expect(tabB.body.error.code).toBe('STALE_WRITE');

      const final = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(Number(final.price)).toBe(50); // tab A's write stands, not silently overwritten
    });

    it('accepts the write when expectedLastEdit is fresh (re-fetched after the conflict)', async () => {
      const p = await makeProduct(categoryId, { over: { price: 10 } });
      const first = await request(app)
        .get(`/api/products/${p.id}`);
      await request(app)
        .patch(`/api/products/${p.id}`)
        .set(bearer(adminToken))
        .send({ price: 50, expectedLastEdit: first.body.product.lastEdit });

      // Re-fetch, as the frontend does after a 409, then retry with the now-current lastEdit.
      const refetched = await request(app).get(`/api/products/${p.id}`);
      const res = await request(app)
        .patch(`/api/products/${p.id}`)
        .set(bearer(adminToken))
        .send({ price: 70, expectedLastEdit: refetched.body.product.lastEdit });
      expect(res.status).toBe(200);
      expect(Number(res.body.product.price)).toBe(70);
    });

    it('resubmitting an existing (now-archived) placement unchanged still succeeds', async () => {
      // A product placed under a category that gets archived AFTER the
      // product was created/placed there — the admin form always resends
      // the product's current, full category set on every save, so this
      // used to permanently block editing ANY field of the product.
      const archivedAdjacent = await makeCategory({ slug: 'sport-sandals-men-branch' });
      const p = await makeProduct(archivedAdjacent.id, {
        additionalCategoryIds: [categoryId],
        over: { nameEn: 'Sport Sandals' },
      });
      await request(app).delete(`/api/categories/${archivedAdjacent.id}`).set(bearer(adminToken));

      // Editing an unrelated field, resubmitting the SAME primary/additional
      // category ids the product already had (unchanged) — must succeed.
      const res = await request(app)
        .patch(`/api/products/${p.id}`)
        .set(bearer(adminToken))
        .send({
          price: 99,
          primaryCategoryId: archivedAdjacent.id,
          additionalCategoryIds: [categoryId],
        });
      expect(res.status).toBe(200);
      expect(Number(res.body.product.price)).toBe(99);
      expect(res.body.product.primaryCategoryID).toBe(archivedAdjacent.id);
    });

    it('409s newly assigning the product to a DIFFERENT, already-archived category', async () => {
      const otherArchived = await makeCategory({ slug: 'other-archived' });
      await request(app).delete(`/api/categories/${otherArchived.id}`).set(bearer(adminToken));

      const p = await makeProduct(categoryId);
      const res = await request(app)
        .patch(`/api/products/${p.id}`)
        .set(bearer(adminToken))
        .send({ additionalCategoryIds: [otherArchived.id] });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');

      const row = await prisma.product.findUnique({ where: { id: p.id }, include: { categoryLinks: true } });
      expect(row?.categoryLinks).toHaveLength(0); // rejected — never linked
    });

    it('soft-deletes a product', async () => {
      const p = await makeProduct(categoryId);
      const res = await request(app).delete(`/api/products/${p.id}`).set(bearer(adminToken));
      expect(res.status).toBe(204);
      const row = await prisma.product.findUnique({ where: { id: p.id } });
      expect(row?.deletedAt).not.toBeNull();
      expect(row?.isActive).toBe(false);
    });
  });

  describe('Product variants (admin sub-resource)', () => {
    it('adds a variant and writes an INITIAL stock movement', async () => {
      const p = await makeProduct(categoryId);
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
      const p = await makeProduct(categoryId, {
        variants: [{ sku: 'a', size: 'M', color: 'Black' }],
      });
      const res = await request(app)
        .post(`/api/products/${p.id}/variants`)
        .set(bearer(adminToken))
        .send({ sku: 'b', size: 'M', color: 'Black' });
      expect(res.status).toBe(409);
    });

    it('updates a variant stock and logs an ADJUSTMENT', async () => {
      const p = await makeProduct(categoryId, {
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
      const p = await makeProduct(categoryId, {
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

    it('409s deleting a product\'s last remaining variant (fix-list.md #17)', async () => {
      const p = await makeProduct(categoryId, {
        variants: [{ sku: 'only', size: 'M', color: 'Black' }],
      });
      const res = await request(app)
        .delete(`/api/products/${p.id}/variants/${p.variants[0].id}`)
        .set(bearer(adminToken));
      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/last variant/i);

      // untouched — still exactly one variant
      const stillThere = await prisma.productVariant.findUnique({ where: { id: p.variants[0].id } });
      expect(stillThere).not.toBeNull();
    });

    it('allows deleting down to exactly one variant, then blocks the last one', async () => {
      const p = await makeProduct(categoryId, {
        variants: [
          { sku: 'a', size: 'M', color: 'Black' },
          { sku: 'b', size: 'L', color: 'Black' },
        ],
      });
      const first = await request(app)
        .delete(`/api/products/${p.id}/variants/${p.variants[1].id}`)
        .set(bearer(adminToken));
      expect(first.status).toBe(204);

      const second = await request(app)
        .delete(`/api/products/${p.id}/variants/${p.variants[0].id}`)
        .set(bearer(adminToken));
      expect(second.status).toBe(409);
      expect(second.body.error.message).toMatch(/last variant/i);
    });
  });

  describe('Product images (admin sub-resource)', () => {
    it('adds / updates / deletes an image', async () => {
      const p = await makeProduct(categoryId);
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
      const p = await makeProduct(categoryId, { over: { price: 12 } });
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

  describe('per-variant price + per-image colour', () => {
    it('a variant with no price falls back to the product price', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(productBody({ price: 20 }));
      expect(res.status).toBe(201);
      const [variant] = res.body.product.variants;
      expect(variant.price).toBeNull();
      expect(Number(variant.effectivePrice)).toBe(20);
    });

    it('a variant with its own price uses that instead of the product price', async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(
          productBody({
            price: 20,
            variants: [
              { sku: 'SKU-1-S', size: 'S', color: 'Black', stockQuantity: 5 },
              { sku: 'SKU-1-XL', size: 'XL', color: 'Black', price: 24, stockQuantity: 5 },
            ],
          })
        );
      expect(res.status).toBe(201);
      const bySize = Object.fromEntries(
        res.body.product.variants.map((v: { size: string; price: string | null; effectivePrice: string }) => [
          v.size,
          v,
        ])
      );
      expect(bySize.S.price).toBeNull();
      expect(Number(bySize.S.effectivePrice)).toBe(20);
      expect(Number(bySize.XL.price)).toBe(24);
      expect(Number(bySize.XL.effectivePrice)).toBe(24);
    });

    it("a variant's own price still gets the product-level sale applied on top", async () => {
      const res = await request(app)
        .post('/api/products')
        .set(bearer(adminToken))
        .send(
          productBody({
            price: 20,
            saleType: 'PERCENT',
            saleValue: 50,
            variants: [{ sku: 'SKU-1-XL', size: 'XL', color: 'Black', price: 30, stockQuantity: 5 }],
          })
        );
      expect(res.status).toBe(201);
      const [variant] = res.body.product.variants;
      expect(Number(variant.price)).toBe(30);
      expect(Number(variant.effectivePrice)).toBe(15); // 50% off the variant's own 30, not the product's 20
      expect(variant.onSale).toBe(true);
    });

    it('POST /variants and PATCH /variants/:id accept and clear a price override', async () => {
      const p = await makeProduct(categoryId);
      const added = await request(app)
        .post(`/api/products/${p.id}/variants`)
        .set(bearer(adminToken))
        .send({ sku: 'NEW-V', size: 'L', color: 'White', price: 33, stockQuantity: 4 });
      expect(added.status).toBe(201);
      expect(Number(added.body.variant.price)).toBe(33);

      const cleared = await request(app)
        .patch(`/api/products/${p.id}/variants/${added.body.variant.id}`)
        .set(bearer(adminToken))
        .send({ price: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.variant.price).toBeNull();
    });

    it('a product image can be tagged with a colour, and cleared back to generic', async () => {
      const p = await makeProduct(categoryId);
      const add = await request(app)
        .post(`/api/products/${p.id}/images`)
        .set(bearer(adminToken))
        .send({ url: 'https://cdn.test/black.jpg', color: 'Black' });
      expect(add.status).toBe(201);
      expect(add.body.image.color).toBe('Black');

      const cleared = await request(app)
        .patch(`/api/products/${p.id}/images/${add.body.image.id}`)
        .set(bearer(adminToken))
        .send({ color: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.image.color).toBeNull();
    });
  });
});
