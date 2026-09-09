import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../src/app';
import { createAdmin, createUser, createCustomer, bearer, signAccessToken } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Beirut',
  deliveryRegion: 'BEIRUT',
};

const authTime = (token: string) =>
  (jwt.decode(token) as { auth_time?: number }).auth_time;

const STALE = Math.floor(Date.now() / 1000) - 20 * 60; // 20 min ago — past the 10 min window

let orderId: string;
let variantId: string;

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory(col.id);
  const p = await makeProduct(col.id, cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 10 }],
  });
  variantId = p.variants[0].id;

  const buyer = await createCustomer();
  await request(app).post('/api/cart/items').set(bearer(buyer.token)).send({ variantId, quantity: 1 });
  const res = await request(app).post('/api/orders/checkout').set(bearer(buyer.token)).send(delivery);
  orderId = res.body.order.id;
});

describe('S2 — step-up auth on sensitive admin routes', () => {
  it('a FRESH admin token passes the step-up-protected routes', async () => {
    const { token } = await createAdmin(); // helper mints auth_time = now

    const status = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(token))
      .send({ status: 'CONFIRMED' });
    expect(status.status).toBe(200);

    const stock = await request(app)
      .patch(`/api/admin/variants/${variantId}/stock`)
      .set(bearer(token))
      .send({ stockQuantity: 7 });
    expect(stock.status).toBe(200);
  });

  it('a STALE admin token (kept alive by refresh) is rejected with STEP_UP_REQUIRED', async () => {
    const { user } = await createAdmin();
    const stale = signAccessToken(user.id, 'ADMIN', STALE);

    const status = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(stale))
      .send({ status: 'CONFIRMED' });
    expect(status.status).toBe(403);
    expect(status.body.error.code).toBe('STEP_UP_REQUIRED');

    const stock = await request(app)
      .patch(`/api/admin/variants/${variantId}/stock`)
      .set(bearer(stale))
      .send({ stockQuantity: 7 });
    expect(stock.status).toBe(403);
    expect(stock.body.error.code).toBe('STEP_UP_REQUIRED');
  });

  it('a token with NO auth_time claim (pre-S2) is treated as stale', async () => {
    const { user } = await createAdmin();
    const legacy = jwt.sign({ id: user.id, role: 'ADMIN' }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: '15m',
    });
    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(legacy))
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STEP_UP_REQUIRED');
  });

  it('a STALE token still works on NON-sensitive admin routes', async () => {
    const { user } = await createAdmin();
    const stale = signAccessToken(user.id, 'ADMIN', STALE);
    const res = await request(app).get('/api/admin/orders?limit=1').set(bearer(stale));
    expect(res.status).toBe(200);
  });
});

describe('S2 — POST /api/auth/step-up', () => {
  const PW = 'C0rrectHorseBatteryStaple!';

  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/step-up').send({ password: PW });
    expect(res.status).toBe(401);
  });

  it('rejects the wrong password without minting a token', async () => {
    const { user } = await createUser({ role: 'ADMIN', password: PW });
    const stale = signAccessToken(user.id, 'ADMIN', STALE);
    const res = await request(app)
      .post('/api/auth/step-up')
      .set(bearer(stale))
      .send({ password: 'not-my-password' });
    expect(res.status).toBe(400);
    expect(res.body.accessToken).toBeUndefined();
  });

  it('with the correct password returns a fresh token that unlocks the sensitive route', async () => {
    const { user } = await createUser({ role: 'ADMIN', password: PW });
    const stale = signAccessToken(user.id, 'ADMIN', STALE);

    // stale token is blocked
    expect(
      (
        await request(app)
          .patch(`/api/admin/orders/${orderId}/status`)
          .set(bearer(stale))
          .send({ status: 'CONFIRMED' })
      ).status
    ).toBe(403);

    const step = await request(app).post('/api/auth/step-up').set(bearer(stale)).send({ password: PW });
    expect(step.status).toBe(200);
    const fresh = step.body.accessToken as string;
    expect(Math.floor(Date.now() / 1000) - authTime(fresh)!).toBeLessThan(5);

    const retry = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(fresh))
      .send({ status: 'CONFIRMED' });
    expect(retry.status).toBe(200);
  });

  it('writes a step_up.success / step_up.invalid audit row', async () => {
    const { user } = await createUser({ role: 'ADMIN', password: PW });
    const stale = signAccessToken(user.id, 'ADMIN', STALE);
    const { prisma } = await import('../../src/config/prisma');

    await request(app).post('/api/auth/step-up').set(bearer(stale)).send({ password: 'wrong' });
    await request(app).post('/api/auth/step-up').set(bearer(stale)).send({ password: PW });

    const rows = await prisma.auditLog.findMany({
      where: { entityType: 'auth', actorID: user.id, action: { startsWith: 'step_up.' } },
    });
    expect(rows.map((r) => r.action).sort()).toEqual(['step_up.invalid', 'step_up.success']);
  });
});

describe('S2 — silent refresh does not reset auth_time', () => {
  it('carries the login auth_time through a refresh unchanged', async () => {
    const PW = 'C0rrectHorseBatteryStaple!';
    await createUser({ role: 'CUSTOMER', email: 'fresh@test.dev', password: PW, emailVerified: true });
    const agent = request.agent(app);

    const login = await agent.post('/api/auth/login').send({ identifier: 'fresh@test.dev', password: PW });
    expect(login.status).toBe(200);
    const before = authTime(login.body.accessToken);
    expect(before).toBeGreaterThan(0);

    const refreshed = await agent.post('/api/auth/refresh').send();
    expect(refreshed.status).toBe(200);
    const after = authTime(refreshed.body.accessToken);

    expect(after).toBe(before);
  });
});
