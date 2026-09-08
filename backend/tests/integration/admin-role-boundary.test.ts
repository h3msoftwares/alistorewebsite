/**
 * S4 — the STAFF vs ADMIN boundary.
 *
 * Baseline: every /api/admin/* and catalog-write route is STAFF+ADMIN.
 * This file pins the routes that are ADMIN-**only**: a STAFF token must get
 * 403, an ADMIN token must succeed. It also spot-checks that the sibling
 * routes which were deliberately LEFT at STAFF still work for STAFF, so the
 * gate isn't quietly over-broad.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { createStaff, createAdmin, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

let staff: string;
let admin: string;

beforeEach(async () => {
  staff = (await createStaff()).token;
  admin = (await createAdmin()).token;
});

const asStaff = (m: 'get' | 'post' | 'patch' | 'delete', p: string, body?: unknown) =>
  request(app)[m](p).set(bearer(staff)).send(body as object);
const asAdmin = (m: 'get' | 'post' | 'patch' | 'delete', p: string, body?: unknown) =>
  request(app)[m](p).set(bearer(admin)).send(body as object);

const okDiscount = {
  nameEn: 'Boundary',
  nameAr: 'حدود',
  scope: 'ALL' as const,
  type: 'PERCENT' as const,
  value: 10,
};
const okCoupon = { code: 'BOUND10', type: 'PERCENT' as const, value: 10 };

describe('S4 — permanent (hard) deletes are ADMIN-only', () => {
  it('DELETE /api/products/:id/permanent', async () => {
    const col = await makeCollection({ slug: 'p-perm' });
    const cat = await makeCategory(col.id, { slug: 'p-perm-c' });
    const p = await makeProduct(col.id, cat.id, { variants: [{ sku: 'x', size: 'M', color: 'B', stockQuantity: 1 }] });
    // Archiving first is a soft delete — STAFF-reachable, and required before a hard delete.
    expect((await asStaff('delete', `/api/products/${p.id}`)).status).toBe(204);

    expect((await asStaff('delete', `/api/products/${p.id}/permanent`)).status).toBe(403);
    expect((await asAdmin('delete', `/api/products/${p.id}/permanent`)).status).toBe(204);
  });

  it('DELETE /api/collections/:id/permanent', async () => {
    const col = await makeCollection({ slug: 'c-perm' });
    expect((await asStaff('delete', `/api/collections/${col.id}`)).status).toBe(200);

    expect((await asStaff('delete', `/api/collections/${col.id}/permanent`)).status).toBe(403);
    expect((await asAdmin('delete', `/api/collections/${col.id}/permanent`)).status).toBe(204);
  });

  it('DELETE /api/categories/:id/permanent', async () => {
    const col = await makeCollection({ slug: 'cat-perm' });
    const cat = await makeCategory(col.id, { slug: 'cat-perm-c' });
    expect((await asStaff('delete', `/api/categories/${cat.id}`)).status).toBe(200);

    expect((await asStaff('delete', `/api/categories/${cat.id}/permanent`)).status).toBe(403);
    expect((await asAdmin('delete', `/api/categories/${cat.id}/permanent`)).status).toBe(204);
  });

  it('the soft delete / archive (DELETE /:id) stays STAFF-reachable', async () => {
    const col = await makeCollection({ slug: 'soft-ok' });
    const cat = await makeCategory(col.id, { slug: 'soft-ok-c' });
    const p = await makeProduct(col.id, cat.id, { variants: [{ sku: 'y', size: 'M', color: 'B', stockQuantity: 1 }] });
    expect((await asStaff('delete', `/api/products/${p.id}`)).status).toBe(204);
    expect((await asStaff('delete', `/api/categories/${cat.id}`)).status).toBe(200);
  });
});

describe('S4 — site settings are ADMIN-only', () => {
  it('PATCH /api/settings', async () => {
    expect((await asStaff('patch', '/api/settings', { brandNameEn: 'Nope' })).status).toBe(403);
    expect((await asAdmin('patch', '/api/settings', { brandNameEn: 'Yep' })).status).toBe(200);
  });

  it('GET /api/settings stays public', async () => {
    expect((await request(app).get('/api/settings')).status).toBe(200);
  });
});

describe('S4 — discount / coupon writes are ADMIN-only, reads stay STAFF', () => {
  it('POST/PATCH/DELETE /api/discounts', async () => {
    expect((await asStaff('post', '/api/discounts', okDiscount)).status).toBe(403);
    const created = await asAdmin('post', '/api/discounts', okDiscount);
    expect(created.status).toBe(201);
    const id = created.body.discount.id;

    expect((await asStaff('patch', `/api/discounts/${id}`, { value: 20 })).status).toBe(403);
    expect((await asAdmin('patch', `/api/discounts/${id}`, { value: 20 })).status).toBe(200);

    expect((await asStaff('delete', `/api/discounts/${id}`)).status).toBe(403);
    expect((await asAdmin('delete', `/api/discounts/${id}`)).status).toBe(204);
  });

  it('POST/PATCH/DELETE /api/coupons', async () => {
    expect((await asStaff('post', '/api/coupons', okCoupon)).status).toBe(403);
    const created = await asAdmin('post', '/api/coupons', okCoupon);
    expect(created.status).toBe(201);
    const id = created.body.coupon.id;

    expect((await asStaff('patch', `/api/coupons/${id}`, { value: 25 })).status).toBe(403);
    expect((await asAdmin('patch', `/api/coupons/${id}`, { value: 25 })).status).toBe(200);

    expect((await asStaff('delete', `/api/coupons/${id}`)).status).toBe(403);
    expect((await asAdmin('delete', `/api/coupons/${id}`)).status).toBe(204);
  });

  it('GET /api/discounts and GET /api/coupons stay STAFF-reachable', async () => {
    expect((await asStaff('get', '/api/discounts')).status).toBe(200);
    expect((await asStaff('get', '/api/coupons')).status).toBe(200);
  });

  it('POST /api/coupons/validate stays public', async () => {
    // 404 (unknown code) is fine — the point is it's not 401/403.
    const res = await request(app).post('/api/coupons/validate').send({ code: 'WHATEVER' });
    expect([200, 404]).toContain(res.status);
  });
});

describe('S4 — financial analytics are ADMIN-only', () => {
  it('GET /api/admin/dashboard', async () => {
    expect((await asStaff('get', '/api/admin/dashboard')).status).toBe(403);
    expect((await asAdmin('get', '/api/admin/dashboard')).status).toBe(200);
  });

  it('GET /api/admin/analytics/sales', async () => {
    expect((await asStaff('get', '/api/admin/analytics/sales')).status).toBe(403);
    expect((await asAdmin('get', '/api/admin/analytics/sales')).status).toBe(200);
  });

  it('GET /api/admin/analytics/customers', async () => {
    expect((await asStaff('get', '/api/admin/analytics/customers')).status).toBe(403);
    expect((await asAdmin('get', '/api/admin/analytics/customers')).status).toBe(200);
  });

  it('the operational analytics reports stay STAFF-reachable', async () => {
    for (const p of ['overview', 'inventory', 'products', 'visitors', 'funnel']) {
      expect((await asStaff('get', `/api/admin/analytics/${p}`)).status).toBe(200);
    }
  });

  it('GET /api/admin/orders stays STAFF-reachable', async () => {
    expect((await asStaff('get', '/api/admin/orders')).status).toBe(200);
  });
});
