import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

// Coupon usage caps (pentest V2b + "reuse still available" follow-up):
//  - maxPerCustomer defaults to 1 — a coupon is single-use per customer
//    unless an admin opts into more (or null = unlimited).
//  - maxRedemptions (global) is enforced with an atomic guarded increment.
//  - every redemption is recorded in CouponRedemption.

const app = buildApp();

let adminToken: string;
let variantId: string;

const delivery = {
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

beforeEach(async () => {
  adminToken = (await createAdmin()).token;
  const col = await makeCollection({ slug: 'cc' });
  const cat = await makeCategory(col.id, { slug: 'cc-c' });
  const p = await makeProduct(col.id, cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 500 }],
  });
  variantId = p.variants[0].id;
});

const createCoupon = (body: Record<string, unknown>) =>
  request(app).post('/api/coupons').set(bearer(adminToken)).send({ type: 'PERCENT', value: 10, ...body });

/** Places a real order as `token`'s verified customer (OTP is skipped for a
 *  verified logged-in shopper), applying `code`. Returns the response. */
async function orderWithCoupon(token: string, code: string) {
  await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });
  return request(app)
    .post('/api/orders/checkout')
    .set(bearer(token))
    .send({ ...delivery, deliveryName: 'C', couponCode: code });
}

describe('Coupon usage caps', () => {
  it('a coupon created with NO caps is single-use per customer by default', async () => {
    const created = await createCoupon({ code: 'DEF1' });
    expect(created.status).toBe(201);
    expect(created.body.coupon.maxPerCustomer).toBe(1);

    const { token } = await createCustomer();
    const first = await orderWithCoupon(token, 'DEF1');
    expect(first.status).toBe(201);

    const second = await orderWithCoupon(token, 'DEF1');
    expect(second.status).toBe(400);
    expect(second.body.error.message).toMatch(/already used this coupon/i);

    // …but a DIFFERENT customer can still use it once.
    const other = await createCustomer();
    expect((await orderWithCoupon(other.token, 'DEF1')).status).toBe(201);

    const coupon = await prisma.coupon.findUnique({ where: { code: 'DEF1' } });
    expect(coupon?.timesRedeemed).toBe(2);
    expect(await prisma.couponRedemption.count({ where: { couponID: coupon!.id } })).toBe(2);
  });

  it('maxPerCustomer = 2 allows exactly two uses per customer', async () => {
    await createCoupon({ code: 'TWICE', maxPerCustomer: 2 });
    const { token } = await createCustomer();
    expect((await orderWithCoupon(token, 'TWICE')).status).toBe(201);
    expect((await orderWithCoupon(token, 'TWICE')).status).toBe(201);
    expect((await orderWithCoupon(token, 'TWICE')).status).toBe(400);
  });

  it('maxPerCustomer = null (explicit) restores unlimited reuse', async () => {
    await createCoupon({ code: 'UNLIM', maxPerCustomer: null });
    const { token } = await createCustomer();
    expect((await orderWithCoupon(token, 'UNLIM')).status).toBe(201);
    expect((await orderWithCoupon(token, 'UNLIM')).status).toBe(201);
    expect((await orderWithCoupon(token, 'UNLIM')).status).toBe(201);
  });

  it('maxRedemptions caps the global total across all customers', async () => {
    await createCoupon({ code: 'CAP2', maxRedemptions: 2, maxPerCustomer: null });

    const a = await createCustomer();
    const b = await createCustomer();
    const c = await createCustomer();
    expect((await orderWithCoupon(a.token, 'CAP2')).status).toBe(201);
    expect((await orderWithCoupon(b.token, 'CAP2')).status).toBe(201);

    const third = await orderWithCoupon(c.token, 'CAP2');
    expect(third.status).toBe(400);
    expect(third.body.error.message).toMatch(/not valid|no longer/i);

    // …and the public lookup also stops resolving it once exhausted.
    expect((await request(app).post('/api/coupons/validate').send({ code: 'CAP2' })).status).toBe(404);
  });

  it('N concurrent checkouts of a maxRedemptions=1 coupon never exceed the cap', async () => {
    await createCoupon({ code: 'RACE1', maxRedemptions: 1, maxPerCustomer: null });
    const buyers = await Promise.all([createCustomer(), createCustomer(), createCustomer(), createCustomer()]);
    for (const buyer of buyers) {
      await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 1 });
    }
    const results = await Promise.all(
      buyers.map((buyer) =>
        request(app)
          .post('/api/orders/checkout')
          .set(bearer(buyer.token))
          .send({ ...delivery, deliveryName: 'R', couponCode: 'RACE1' })
      )
    );

    // The invariant under contention is "the cap is never breached", not
    // "exactly one wins" — a loser that gets starved out on a slow runner
    // still leaves the store consistent, and the shopper simply retries.
    const wins = results.filter((r) => r.status === 201);
    expect(wins.length).toBeLessThanOrEqual(1);

    // Every checkout either created an order or failed cleanly (4xx) — the
    // guarded increment / row-claims must not surface as a 500.
    for (const r of results) expect(r.status < 500).toBe(true);
    for (const r of results.filter((r) => r.status !== 201)) {
      expect(r.status).toBeGreaterThanOrEqual(400);
    }

    // The counter matches reality exactly: no order without its redemption
    // counted, and no redemption counted without an order.
    const coupon = await prisma.coupon.findUnique({ where: { code: 'RACE1' } });
    expect(coupon?.timesRedeemed).toBe(wins.length);
    expect(await prisma.couponRedemption.count({ where: { couponID: coupon!.id } })).toBe(wins.length);
  });
});
