import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, createStaffWith, bearer } from '../helpers/auth';
import { makeCategory, makeProduct } from '../helpers/factories';

vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return { ...actual, sendLoyaltyRewardEmail: vi.fn().mockResolvedValue(true) };
});
import { sendLoyaltyRewardEmail } from '../../src/lib/mailer';
const mockRewardEmail = vi.mocked(sendLoyaltyRewardEmail);

const app = buildApp();

let variantId: string;
const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

beforeEach(async () => {
  mockRewardEmail.mockClear();
  const cat = await makeCategory();
  const p = await makeProduct(cat.id, {
    over: { price: 20 },
    variants: [{ sku: `loy-${Date.now()}`, size: 'M', color: 'Black', stockQuantity: 20 }],
  });
  variantId = p.variants[0].id;
});

// Longer than order-shipping.test.ts's flush — the loyalty check does more
// awaited round trips per rule (metric aggregate, award lookup, coupon
// create, award create, email) before it settles.
async function flushAsync() {
  await new Promise((r) => setTimeout(r, 200));
}

/** Places one order for `token` and delivers it as `staffToken`. */
async function placeAndDeliver(token: string, staffToken: string): Promise<string> {
  await request(app).post('/api/cart/items').set(bearer(token)).send({ variantId, quantity: 1 });
  const checkout = await request(app).post('/api/orders/checkout').set(bearer(token)).send(delivery);
  expect(checkout.status).toBe(201);
  const orderId = checkout.body.order.id as string;

  const res = await request(app)
    .patch(`/api/admin/orders/${orderId}/status`)
    .set(bearer(staffToken))
    .send({ status: 'DELIVERED' });
  expect(res.status).toBe(200);
  await flushAsync();
  return orderId;
}

describe('Loyalty program — rule CRUD', () => {
  it('is gated by loyalty:view / loyalty:manage', async () => {
    const rule = { nameEn: 'x', nameAr: 'x', metric: 'ORDER_COUNT', threshold: 5, rewardType: 'PERCENT', rewardValue: 10 };

    const customer = (await createCustomer()).token;
    expect((await request(app).get('/api/loyalty-rules').set(bearer(customer))).status).toBe(403);

    const { token: viewer } = await createStaffWith(['loyalty:view']);
    expect((await request(app).get('/api/loyalty-rules').set(bearer(viewer))).status).toBe(200);
    expect((await request(app).post('/api/loyalty-rules').set(bearer(viewer)).send(rule)).status).toBe(403);

    const { token: manager } = await createStaffWith(['loyalty:manage']);
    const created = await request(app).post('/api/loyalty-rules').set(bearer(manager)).send(rule);
    expect(created.status).toBe(201);
    expect(created.body.rule.nameEn).toBe('x');
  });

  it('rejects a percentage reward outside 0-100', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    const res = await request(app)
      .post('/api/loyalty-rules')
      .set(bearer(manager))
      .send({ nameEn: 'x', nameAr: 'x', metric: 'ORDER_COUNT', threshold: 5, rewardType: 'PERCENT', rewardValue: 150 });
    expect(res.status).toBe(400);
  });

  it('updates only the fields sent, leaving the rest untouched', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    const created = await request(app)
      .post('/api/loyalty-rules')
      .set(bearer(manager))
      .send({ nameEn: 'Original', nameAr: 'أصلي', metric: 'ORDER_COUNT', threshold: 5, rewardType: 'PERCENT', rewardValue: 10 });
    const id = created.body.rule.id as string;

    const res = await request(app)
      .patch(`/api/loyalty-rules/${id}`)
      .set(bearer(manager))
      .send({ threshold: 8 });
    expect(res.status).toBe(200);
    expect(Number(res.body.rule.threshold)).toBe(8);
    expect(res.body.rule.nameEn).toBe('Original');
    expect(Number(res.body.rule.rewardValue)).toBe(10); // untouched, still the original value
  });

  it('rejects an update that pushes the percentage reward out of range, checked against the MERGED value', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    const created = await request(app)
      .post('/api/loyalty-rules')
      .set(bearer(manager))
      .send({ nameEn: 'x', nameAr: 'x', metric: 'ORDER_COUNT', threshold: 5, rewardType: 'PERCENT', rewardValue: 10 });
    const id = created.body.rule.id as string;

    // Only rewardValue is sent — rewardType (PERCENT) comes from the existing row.
    const res = await request(app).patch(`/api/loyalty-rules/${id}`).set(bearer(manager)).send({ rewardValue: 150 });
    expect(res.status).toBe(400);
  });

  it('404s updating or deleting an unknown rule id', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    const missing = randomUUID();
    expect(
      (await request(app).patch(`/api/loyalty-rules/${missing}`).set(bearer(manager)).send({ threshold: 1 })).status
    ).toBe(404);
    expect((await request(app).delete(`/api/loyalty-rules/${missing}`).set(bearer(manager))).status).toBe(404);
  });

  it('deleting a rule stops it from firing on a later DELIVERED order', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    const created = await request(app)
      .post('/api/loyalty-rules')
      .set(bearer(manager))
      .send({ nameEn: 'Every order', nameAr: 'كل طلب', metric: 'ORDER_COUNT', threshold: 1, rewardType: 'PERCENT', rewardValue: 10 });
    const id = created.body.rule.id as string;

    const del = await request(app).delete(`/api/loyalty-rules/${id}`).set(bearer(manager));
    expect(del.status).toBe(204);

    const { user, token: customer } = await createCustomer();
    const { token: staff } = await createStaffWith(['orders:manage']);
    await placeAndDeliver(customer, staff);

    expect(mockRewardEmail).not.toHaveBeenCalled();
    expect(await prisma.loyaltyAward.count({ where: { userID: user.id } })).toBe(0);
  });
});

describe('Loyalty program — milestone trigger on DELIVERED', () => {
  it('repeats: a customer earns a new coupon each time they cross another multiple of the ORDER_COUNT threshold', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    await request(app)
      .post('/api/loyalty-rules')
      .set(bearer(manager))
      .send({ nameEn: 'Every 2 orders', nameAr: 'كل طلبين', metric: 'ORDER_COUNT', threshold: 2, rewardType: 'PERCENT', rewardValue: 15 });

    const { user, token: customer } = await createCustomer();
    const { token: staff } = await createStaffWith(['orders:manage']);

    // 1st delivered order: count=1, milestone floor(1/2)=0 — no award yet.
    await placeAndDeliver(customer, staff);
    expect(mockRewardEmail).not.toHaveBeenCalled();
    expect(await prisma.loyaltyAward.count({ where: { userID: user.id } })).toBe(0);

    // 2nd delivered order: count=2, milestone 1 — awards.
    await placeAndDeliver(customer, staff);
    expect(mockRewardEmail).toHaveBeenCalledTimes(1);
    let awards = await prisma.loyaltyAward.findMany({ where: { userID: user.id }, include: { coupon: true } });
    expect(awards).toHaveLength(1);
    expect(awards[0].milestoneNumber).toBe(1);
    expect(Number(awards[0].coupon?.value)).toBe(15);
    expect(awards[0].coupon?.type).toBe('PERCENT');
    expect(awards[0].coupon?.maxPerCustomer).toBe(1);

    // 3rd delivered order: count=3, milestone floor(3/2)=1 — already awarded, no new coupon.
    await placeAndDeliver(customer, staff);
    expect(mockRewardEmail).toHaveBeenCalledTimes(1);

    // 4th delivered order: count=4, milestone 2 — awards again (the "repeat").
    await placeAndDeliver(customer, staff);
    expect(mockRewardEmail).toHaveBeenCalledTimes(2);
    awards = await prisma.loyaltyAward.findMany({ where: { userID: user.id }, orderBy: { milestoneNumber: 'asc' } });
    expect(awards.map((a) => a.milestoneNumber)).toEqual([1, 2]);
  });

  it('TOTAL_SPENT metric fires once the sum of delivered orders crosses the threshold', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    await request(app)
      .post('/api/loyalty-rules')
      .set(bearer(manager))
      .send({ nameEn: 'Spend $30', nameAr: 'أنفق 30$', metric: 'TOTAL_SPENT', threshold: 30, rewardType: 'AMOUNT', rewardValue: 5 });

    const { user, token: customer } = await createCustomer();
    const { token: staff } = await createStaffWith(['orders:manage']);

    // Product price is $20 — one order isn't enough ($20 < $30).
    await placeAndDeliver(customer, staff);
    expect(await prisma.loyaltyAward.count({ where: { userID: user.id } })).toBe(0);

    // A second $20 order brings the lifetime total to $40 >= $30 — awards.
    await placeAndDeliver(customer, staff);
    expect(mockRewardEmail).toHaveBeenCalledTimes(1);
    expect(await prisma.loyaltyAward.count({ where: { userID: user.id } })).toBe(1);
  });

  it('a customer who never crosses the threshold earns nothing, and different customers are tracked independently', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    await request(app)
      .post('/api/loyalty-rules')
      .set(bearer(manager))
      .send({ nameEn: 'Every 5 orders', nameAr: 'كل 5 طلبات', metric: 'ORDER_COUNT', threshold: 5, rewardType: 'PERCENT', rewardValue: 10 });

    const { user: userA, token: customerA } = await createCustomer();
    const { user: userB, token: customerB } = await createCustomer();
    const { token: staff } = await createStaffWith(['orders:manage']);

    await placeAndDeliver(customerA, staff);
    await placeAndDeliver(customerA, staff);
    await placeAndDeliver(customerB, staff);

    expect(mockRewardEmail).not.toHaveBeenCalled();
    expect(await prisma.loyaltyAward.count({ where: { userID: userA.id } })).toBe(0);
    expect(await prisma.loyaltyAward.count({ where: { userID: userB.id } })).toBe(0);
  });

  it('an inactive rule never awards', async () => {
    const { token: manager } = await createStaffWith(['loyalty:manage']);
    await request(app)
      .post('/api/loyalty-rules')
      .set(bearer(manager))
      .send({
        nameEn: 'Off',
        nameAr: 'موقوفة',
        metric: 'ORDER_COUNT',
        threshold: 1,
        rewardType: 'PERCENT',
        rewardValue: 10,
        isActive: false,
      });

    const { user, token: customer } = await createCustomer();
    const { token: staff } = await createStaffWith(['orders:manage']);
    await placeAndDeliver(customer, staff);

    expect(mockRewardEmail).not.toHaveBeenCalled();
    expect(await prisma.loyaltyAward.count({ where: { userID: user.id } })).toBe(0);
  });
});
