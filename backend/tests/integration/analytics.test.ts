import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { OrderStatus } from '@prisma/client';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createAdmin, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

interface SeedLine {
  variantId: string;
  productName: string;
  productSKU: string;
  variantSKU: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unitPrice: number;
}

async function makeOrder(opts: {
  userID?: string | null;
  status?: OrderStatus;
  dateCreated?: Date;
  lines: SeedLine[];
}) {
  const total = opts.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  return prisma.order.create({
    data: {
      orderNumber: `AS-${Math.random().toString(36).slice(2, 10)}`,
      userID: opts.userID ?? null,
      status: opts.status ?? 'PENDING',
      dateCreated: opts.dateCreated ?? new Date(),
      deliveryName: 'Test',
      deliveryPhone: '0790000000',
      deliveryAddress: 'Street',
      deliveryCity: 'Beirut',
      subtotal: total,
      total,
      items: {
        create: opts.lines.map((l) => ({
          variantID: l.variantId,
          productName: l.productName,
          productSKU: l.productSKU,
          variantSKU: l.variantSKU,
          size: l.size,
          color: l.color,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.unitPrice * l.quantity,
        })),
      },
    },
  });
}

let adminToken: string;
let alphaM: SeedLine; // Alpha Tee / M / Black @20, stock 3 (low)
let betaOS: SeedLine; // Beta Dress / one-size / Red @50, stock 40

beforeEach(async () => {
  const col = await makeCollection({ slug: `c-${Math.random().toString(36).slice(2, 8)}` });
  const cat = await makeCategory(col.id, { nameEn: 'Dresses' });

  const alpha = await makeProduct(col.id, cat.id, {
    over: { nameEn: 'Alpha Tee', sku: 'ALPHA', price: 20 },
    variants: [
      { sku: 'ALPHA-M-BLK', size: 'M', color: 'Black', stockQuantity: 3 },
      { sku: 'ALPHA-L-BLK', size: 'L', color: 'Black', stockQuantity: 0 },
    ],
  });
  const beta = await makeProduct(col.id, cat.id, {
    over: { nameEn: 'Beta Dress', sku: 'BETA', price: 50 },
    variants: [{ sku: 'BETA-OS-RED', size: null, color: 'Red', stockQuantity: 40 }],
  });

  alphaM = {
    variantId: alpha.variants[0].id,
    productName: 'Alpha Tee',
    productSKU: 'ALPHA',
    variantSKU: 'ALPHA-M-BLK',
    size: 'M',
    color: 'Black',
    quantity: 1,
    unitPrice: 20,
  };
  betaOS = {
    variantId: beta.variants[0].id,
    productName: 'Beta Dress',
    productSKU: 'BETA',
    variantSKU: 'BETA-OS-RED',
    size: null,
    color: 'Red',
    quantity: 1,
    unitPrice: 50,
  };

  const c1 = await createCustomer();
  const c2 = await createCustomer();
  adminToken = (await createAdmin()).token;

  // c1: an order 60d ago (outside the default 30d window) → makes c1 "returning"
  await makeOrder({ userID: c1.user.id, status: 'DELIVERED', dateCreated: ago(60), lines: [{ ...alphaM, quantity: 1 }] });
  // c1: DELIVERED 14d ago, Alpha x2 → 40
  await makeOrder({ userID: c1.user.id, status: 'DELIVERED', dateCreated: ago(14), lines: [{ ...alphaM, quantity: 2 }] });
  // c1: PENDING now, Beta x1 → 50
  await makeOrder({ userID: c1.user.id, status: 'PENDING', lines: [{ ...betaOS, quantity: 1 }] });
  // c2: CONFIRMED now, Alpha x1 + Beta x1 → 70
  await makeOrder({
    userID: c2.user.id,
    status: 'CONFIRMED',
    lines: [{ ...alphaM, quantity: 1 }, { ...betaOS, quantity: 1 }],
  });
  // guest CANCELLED now → excluded everywhere
  await makeOrder({ userID: null, status: 'CANCELLED', lines: [{ ...betaOS, quantity: 1 }] });
});

describe('GET /api/admin/analytics/* — access control', () => {
  it('401 for anon, 403 for a customer, 200 for an admin', async () => {
    expect((await request(app).get('/api/admin/analytics/overview')).status).toBe(401);

    const cust = await createCustomer();
    expect(
      (await request(app).get('/api/admin/analytics/overview').set(bearer(cust.token))).status
    ).toBe(403);

    expect(
      (await request(app).get('/api/admin/analytics/overview').set(bearer(adminToken))).status
    ).toBe(200);
  });
});

describe('GET /api/admin/analytics/overview', () => {
  it('aggregates non-cancelled orders inside the default 30-day window', async () => {
    const { body } = await request(app)
      .get('/api/admin/analytics/overview')
      .set(bearer(adminToken));

    expect(body.kpis).toMatchObject({
      revenue: 160, // merchandise (SUM subtotal): 40 + 50 + 70
      deliveryRevenue: 0, // no delivery fee on the seeded orders
      orders: 3,
      deliveredRevenue: 40,
      unitsSold: 5, // 2 + 1 + (1 + 1)
      returningCustomers: 1, // c1 has an order older than the window
      lowStockVariants: 1, // ALPHA-M-BLK has 3; the L is 0 (out of stock, not low)
    });
    expect(body.kpis.averageOrderValue).toBeCloseTo(160 / 3);
    expect(Array.isArray(body.revenueSeries)).toBe(true);
    // No GA4 service account configured in tests.
    expect(body.funnel).toEqual({ configured: false });
  });
});

describe('GET /api/admin/analytics/visitors + /funnel (GA4 not configured)', () => {
  it('degrades to { configured: false } instead of erroring', async () => {
    const visitors = await request(app)
      .get('/api/admin/analytics/visitors')
      .set(bearer(adminToken));
    expect(visitors.status).toBe(200);
    expect(visitors.body).toEqual({ configured: false });

    const funnel = await request(app).get('/api/admin/analytics/funnel').set(bearer(adminToken));
    expect(funnel.body).toEqual({ configured: false });
  });
});

describe('GET /api/admin/analytics/sales', () => {
  it('breaks revenue down by size and colour', async () => {
    const { body } = await request(app).get('/api/admin/analytics/sales').set(bearer(adminToken));

    const size = Object.fromEntries(body.bySize.map((r: { label: string }) => [r.label, r]));
    expect(size['M']).toMatchObject({ units: 3, revenue: 60 });
    expect(size['—']).toMatchObject({ units: 2, revenue: 100 });

    const colour = Object.fromEntries(body.byColour.map((r: { label: string }) => [r.label, r]));
    expect(colour['Black']).toMatchObject({ units: 3, revenue: 60 });
    expect(colour['Red']).toMatchObject({ units: 2, revenue: 100 });
  });
});

describe('GET /api/admin/analytics/customers', () => {
  it('computes repeat rate, LTV and range-scoped top customers', async () => {
    const { body } = await request(app)
      .get('/api/admin/analytics/customers')
      .set(bearer(adminToken));

    expect(body.kpis).toMatchObject({
      customersWithOrders: 2,
      repeatPurchaseRate: 0.5, // c1 has >= 2 orders, c2 has 1
      newCustomers: 1, // c2 (first-ever order is inside the window)
      returningCustomers: 1, // c1
      ordersPerCustomer: 2, // 4 non-cancelled orders across 2 customers
    });
    expect(body.kpis.lifetimeValue).toBeCloseTo(90); // (20+40+50 + 70) / 2
    expect(body.topCustomers[0].revenue).toBe(90); // c1, range-scoped (40 + 50)
  });
});

describe('GET /api/admin/analytics/inventory', () => {
  it('reports stock value, sell-through and the low / out-of-stock lists', async () => {
    const { body } = await request(app)
      .get('/api/admin/analytics/inventory')
      .set(bearer(adminToken));

    expect(body.kpis).toMatchObject({
      stockUnits: 43, // 3 + 0 + 40
      stockValue: 2060, // 3*20 + 0 + 40*50
      unitsSold: 5,
      lowStockCount: 1,
      outOfStockCount: 1,
    });
    expect(body.kpis.sellThroughRate).toBeCloseTo(5 / 48);
    expect(body.lowStock[0]).toMatchObject({ sku: 'ALPHA-M-BLK', stock: 3 });
    expect(body.outOfStock[0]).toMatchObject({ sku: 'ALPHA-L-BLK' });
  });
});

describe('GET /api/admin/analytics/products', () => {
  it('ranks products by in-range revenue', async () => {
    const { body } = await request(app)
      .get('/api/admin/analytics/products')
      .set(bearer(adminToken));

    expect(body.products.map((p: { sku: string }) => p.sku)).toEqual(['BETA', 'ALPHA']);
    expect(body.products[0]).toMatchObject({ sku: 'BETA', revenue: 100, units: 2, views: null });
    expect(body.products[1]).toMatchObject({ sku: 'ALPHA', revenue: 60, units: 3 });
    expect(body.ga).toEqual({ configured: false });
  });
});
