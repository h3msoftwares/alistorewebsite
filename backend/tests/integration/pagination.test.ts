import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let collectionId: string;
let categoryId: string;

// 7 products in one category — enough to exercise multi-page boundaries.
beforeEach(async () => {
  const col = await makeCollection({ slug: 'pg-col' });
  const cat = await makeCategory(col.id, { slug: 'pg-cat' });
  collectionId = col.id;
  categoryId = cat.id;
  for (let i = 0; i < 7; i++) {
    await makeProduct(col.id, cat.id, {
      over: { nameEn: `PG Product ${i}`, price: 10 + i },
      variants: [{ sku: `pg-${i}`, stockQuantity: 5 }],
    });
  }
});

describe('GET /api/products — pagination boundaries', () => {
  const list = (q: string) => request(app).get(`/api/products?${q}`);

  it('reports the full total regardless of page size, and the last page is partial', async () => {
    const p1 = await list('pageSize=3&page=1');
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ total: 7, page: 1, pageSize: 3 });
    expect(p1.body.items).toHaveLength(3);

    const p3 = await list('pageSize=3&page=3'); // ceil(7/3) = 3 → 1 item
    expect(p3.body.items).toHaveLength(1);
    expect(p3.body.total).toBe(7);
  });

  it('a page past the end returns an empty list with the real total (not an error)', async () => {
    const res = await list('pageSize=3&page=99');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body).toMatchObject({ total: 7, page: 99, pageSize: 3 });
  });

  it('no overlap and no gaps across consecutive pages', async () => {
    const [a, b, c] = await Promise.all([
      list('pageSize=3&page=1'),
      list('pageSize=3&page=2'),
      list('pageSize=3&page=3'),
    ]);
    const ids = [...a.body.items, ...b.body.items, ...c.body.items].map((p: { id: string }) => p.id);
    expect(new Set(ids).size).toBe(7); // 3 + 3 + 1, all distinct
  });

  it('rejects page < 1 and non-integer page (400)', async () => {
    expect((await list('page=0')).status).toBe(400);
    expect((await list('page=-1')).status).toBe(400);
    expect((await list('page=1.5')).status).toBe(400);
    expect((await list('page=abc')).status).toBe(400);
  });

  it('rejects pageSize below 1 or above the 60 cap (400)', async () => {
    expect((await list('pageSize=0')).status).toBe(400);
    expect((await list('pageSize=61')).status).toBe(400);
    expect((await list('pageSize=1000')).status).toBe(400);
  });

  it('defaults to page 1, pageSize 24 when omitted', async () => {
    const res = await list('');
    expect(res.body).toMatchObject({ page: 1, pageSize: 24 });
    expect(res.body.items).toHaveLength(7); // all 7 fit on the default page
  });
});

describe('GET /api/categories/:id/products — pagination boundaries', () => {
  it('scopes to the category and paginates the same way', async () => {
    const p1 = await request(app).get(`/api/categories/${categoryId}/products?pageSize=4&page=1`);
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ total: 7, page: 1, pageSize: 4 });
    expect(p1.body.items).toHaveLength(4);

    const p2 = await request(app).get(`/api/categories/${categoryId}/products?pageSize=4&page=2`);
    expect(p2.body.items).toHaveLength(3);

    expect((await request(app).get(`/api/categories/${categoryId}/products?page=0`)).status).toBe(400);
  });

  it('the collectionId filter narrows the total consistently', async () => {
    const other = await makeCollection({ slug: 'pg-col-2' });
    const otherCat = await makeCategory(other.id, { slug: 'pg-cat-2' });
    await makeProduct(other.id, otherCat.id, { variants: [{ sku: 'pg-other', stockQuantity: 1 }] });

    const scoped = await request(app).get(`/api/products?collectionId=${collectionId}&pageSize=60`);
    expect(scoped.body.total).toBe(7); // the 8th product is in the other collection
  });
});
