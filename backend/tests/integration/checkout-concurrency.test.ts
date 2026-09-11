import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createAdmin, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

/**
 * Production-readiness audit — checkout data-integrity under concurrency.
 *
 * The bar: **stock can never oversell or go negative, and one cart can never
 * become two orders**, no matter how requests race. Exact success *counts* are
 * asserted where the harness is quiet enough; where 20 in-process transactions
 * strain the default Prisma pool, the tests assert the invariants instead (a
 * pool-timeout 500 is a graceful-degradation issue, not an integrity one — and
 * is noted separately in the audit).
 *
 * Note: `OUT_OF_STOCK` maps to HTTP 409 (a "sold out mid-checkout" conflict),
 * `VALIDATION_ERROR` ("cart is empty") to 400.
 */

const app = buildApp();

const delivery = {
  deliveryName: 'Race Tester',
  deliveryPhone: '0791234567',
  deliveryAddress: '1 Contention Ave',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

let catId: string;
let colId: string;

beforeEach(async () => {
  const col = await makeCollection({ slug: 'cx' });
  const cat = await makeCategory(col.id, { slug: 'cx-c' });
  colId = col.id;
  catId = cat.id;
});

async function makeVariant(stock: number, sku = `v-${Math.random().toString(36).slice(2, 8)}`) {
  const p = await makeProduct(colId, catId, { over: { price: 20 }, variants: [{ sku, size: 'M', color: 'Black', stockQuantity: stock }] });
  return p.variants[0].id;
}

async function customersWithCartItem(n: number, variantId: string) {
  const buyers = await Promise.all(Array.from({ length: n }, () => createCustomer()));
  await Promise.all(
    buyers.map((b) => request(app).post('/api/cart/items').set(bearer(b.token)).send({ variantId, quantity: 1 }))
  );
  return buyers;
}

const fireCheckout = (token: string, body: Record<string, unknown> = {}) =>
  request(app).post('/api/orders/checkout').set(bearer(token)).send({ ...delivery, ...body });

const OVERSELL = 'stock must never go negative';

describe('checkout concurrency / data integrity', () => {
  it('last-unit race: N buyers, 1 unit — exactly one order, stock floors at 0', async () => {
    const N = 8;
    const variantId = await makeVariant(1);
    const buyers = await customersWithCartItem(N, variantId);

    const results = await Promise.all(buyers.map((b) => fireCheckout(b.token)));
    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status !== 201);

    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(N - 1);
    // every rejection is a clean 409 OUT_OF_STOCK, never a 5xx. The atomic
    // race-guard's message covers both "sold out" and "archived/deleted
    // concurrently" (fix-list.md #8/#15/#16), so it reads "no longer
    // available" rather than naming stock specifically.
    expect(rejected.every((r) => r.status === 409)).toBe(true);
    expect(rejected.every((r) => /stock|no longer available/i.test(r.body?.error?.message ?? ''))).toBe(true);
    expect(results.filter((r) => r.status >= 500)).toHaveLength(0);

    const v = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(v!.stockQuantity, OVERSELL).toBe(0);
    expect(await prisma.order.count()).toBe(1);
    const moves = await prisma.stockMovement.findMany({ where: { variantID: variantId } });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: 'SALE', quantity: -1 });
  });

  it('heavy contention: 12 buyers, 3 units — never oversells, invariants hold', async () => {
    const N = 12;
    const stock = 3;
    const variantId = await makeVariant(stock);
    const buyers = await customersWithCartItem(N, variantId);

    const results = await Promise.all(buyers.map((b) => fireCheckout(b.token)));
    const created = results.filter((r) => r.status === 201).length;
    const soldOut = results.filter((r) => r.status === 409).length;
    const busy503 = results.filter((r) => r.status === 503).length;   // graceful "retry" (Phase-D)
    const raw500 = results.filter((r) => r.status === 500).length;    // NOT acceptable

    // core integrity — must hold regardless of pool pressure
    expect(created).toBeLessThanOrEqual(stock);          // never oversold
    const v = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(v!.stockQuantity, OVERSELL).toBeGreaterThanOrEqual(0);
    expect(v!.stockQuantity).toBe(stock - created);      // decremented exactly per success
    const sold = await prisma.stockMovement.aggregate({ where: { variantID: variantId, type: 'SALE' }, _sum: { quantity: true } });
    expect(Math.abs(Number(sold._sum.quantity ?? 0))).toBe(created); // one -1 SALE per committed order
    expect(await prisma.order.count()).toBe(created);
    expect(await prisma.orderItem.count()).toBe(created);

    // graceful degradation: a busy pool should answer 503 (retry), never a bare 500
    console.log(`[heavy-contention] created=${created} soldOut(409)=${soldOut} busy(503)=${busy503} raw(500)=${raw500}`);
    expect(raw500).toBe(0);
    expect(created + soldOut + busy503).toBe(N);
    if (created === stock) expect(soldOut).toBe(N - stock); // with the tx fix, the losers see 409 not 503
  });

  it('one shopper, concurrent double-submit: exactly one order from one cart', async () => {
    const variantId = await makeVariant(50);
    const { token } = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });

    const results = await Promise.all(Array.from({ length: 5 }, () => fireCheckout(token)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status >= 500)).toHaveLength(0);

    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.orderItem.count()).toBe(1);
    const v = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(v!.stockQuantity).toBe(49); // decremented exactly once
    const cart = await prisma.cart.findFirst({ include: { items: true } });
    expect(cart?.items ?? []).toHaveLength(0);
  });

  it('one shopper, sequential re-submit: the emptied cart blocks the duplicate', async () => {
    const variantId = await makeVariant(50);
    const { token } = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });

    expect((await fireCheckout(token)).status).toBe(201);
    const second = await fireCheckout(token);
    expect(second.status).toBe(400);
    expect(second.body.error.message).toMatch(/cart is empty/i);
    expect(await prisma.order.count()).toBe(1);
  });

  it('global coupon cap holds under a concurrent stampede', async () => {
    const adminToken = (await createAdmin()).token;
    const variantId = await makeVariant(100);
    const N = 6;
    const cap = 3;
    expect(
      (await request(app).post('/api/coupons').set(bearer(adminToken))
        .send({ code: 'STAMPEDE', type: 'PERCENT', value: 10, maxRedemptions: cap, maxPerCustomer: null })).status
    ).toBe(201);

    const buyers = await customersWithCartItem(N, variantId);
    const results = await Promise.all(buyers.map((b) => fireCheckout(b.token, { couponCode: 'STAMPEDE' })));

    expect(results.filter((r) => r.status === 201).length).toBeLessThanOrEqual(cap);
    expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
    const coupon = await prisma.coupon.findUnique({ where: { code: 'STAMPEDE' } });
    expect(coupon!.timesRedeemed).toBeLessThanOrEqual(cap);
    expect(coupon!.timesRedeemed).toBe(await prisma.couponRedemption.count({ where: { couponID: coupon!.id } }));
    // no redemption without a committed order
    expect(coupon!.timesRedeemed).toBe(await prisma.order.count({ where: { couponCode: 'STAMPEDE' } }));
  });

  it('mid-transaction failure rolls the entire checkout back', async () => {
    // Cart has a good line (stock 5) + a doomed line (stock 0). The atomic
    // decrement on the doomed line returns count 0 -> the whole tx rolls back.
    const goodVariant = await makeVariant(5, 'good-line');
    const doomedVariant = await makeVariant(0, 'doomed-line');
    const { token } = await createCustomer();
    await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId: goodVariant, quantity: 1 });
    const cart = await prisma.cart.findFirst();
    await prisma.cartItem.create({ data: { cartID: cart!.id, variantID: doomedVariant, quantity: 1 } });

    const res = await fireCheckout(token);
    expect(res.status).toBe(409);            // OUT_OF_STOCK on the doomed line
    expect(res.status).toBeLessThan(500);

    // nothing committed
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
    // the good line's stock is untouched — proves the rollback
    expect((await prisma.productVariant.findUnique({ where: { id: goodVariant } }))!.stockQuantity).toBe(5);
    // cart NOT cleared (checkout never reached the delete)
    expect((await prisma.cart.findFirst({ include: { items: true } }))!.items).toHaveLength(2);
  });
});
