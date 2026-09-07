import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createStaff, createCustomer, bearer } from '../helpers/auth';

const app = buildApp();

const body = (endpoint: string, keys = { p256dh: 'p256dh-key', auth: 'auth-key' }) => ({ endpoint, keys });

describe('POST /api/admin/push-subscriptions', () => {
  it('saves a subscription for the authenticated admin', async () => {
    const { user, token } = await createAdmin();
    const res = await request(app)
      .post('/api/admin/push-subscriptions')
      .set(bearer(token))
      .send(body('https://push.example/abc'));
    expect(res.status).toBe(204);

    const rows = await prisma.pushSubscription.findMany({ where: { userID: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      endpoint: 'https://push.example/abc',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    });
  });

  it('works for STAFF too, not just ADMIN', async () => {
    const { token } = await createStaff();
    const res = await request(app)
      .post('/api/admin/push-subscriptions')
      .set(bearer(token))
      .send(body('https://push.example/staff'));
    expect(res.status).toBe(204);
  });

  it('upserts on the same endpoint — re-subscribing updates the row instead of duplicating it', async () => {
    const { user, token } = await createAdmin();
    const endpoint = 'https://push.example/same';

    await request(app).post('/api/admin/push-subscriptions').set(bearer(token)).send(body(endpoint));
    const second = await request(app)
      .post('/api/admin/push-subscriptions')
      .set(bearer(token))
      .send(body(endpoint, { p256dh: 'new-p256dh', auth: 'new-auth' }));
    expect(second.status).toBe(204);

    const rows = await prisma.pushSubscription.findMany({ where: { endpoint } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userID: user.id, p256dh: 'new-p256dh', auth: 'new-auth' });
  });

  it('re-subscribing under a different account transfers ownership of that endpoint', async () => {
    const first = await createAdmin();
    const second = await createAdmin();
    const endpoint = 'https://push.example/shared-machine';

    await request(app).post('/api/admin/push-subscriptions').set(bearer(first.token)).send(body(endpoint));
    await request(app).post('/api/admin/push-subscriptions').set(bearer(second.token)).send(body(endpoint));

    const rows = await prisma.pushSubscription.findMany({ where: { endpoint } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userID).toBe(second.user.id);
  });

  it('400s a malformed body (not a URL, missing keys)', async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post('/api/admin/push-subscriptions')
      .set(bearer(token))
      .send({ endpoint: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('rejects anon (401) and a customer (403) — this is a STAFF/ADMIN-only surface', async () => {
    const anon = await request(app).post('/api/admin/push-subscriptions').send(body('https://push.example/x'));
    expect(anon.status).toBe(401);

    const { token } = await createCustomer();
    const customer = await request(app)
      .post('/api/admin/push-subscriptions')
      .set(bearer(token))
      .send(body('https://push.example/y'));
    expect(customer.status).toBe(403);

    expect(await prisma.pushSubscription.count()).toBe(0);
  });
});

describe('DELETE /api/admin/push-subscriptions', () => {
  it('removes the caller’s own subscription', async () => {
    const { user, token } = await createAdmin();
    const endpoint = 'https://push.example/mine';
    await prisma.pushSubscription.create({
      data: { userID: user.id, endpoint, p256dh: 'p', auth: 'a' },
    });

    const res = await request(app).delete('/api/admin/push-subscriptions').set(bearer(token)).send({ endpoint });
    expect(res.status).toBe(204);
    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it('does not delete another admin’s subscription (no cross-account removal)', async () => {
    const victim = await createAdmin();
    const attacker = await createAdmin();
    const endpoint = 'https://push.example/victim';
    await prisma.pushSubscription.create({
      data: { userID: victim.user.id, endpoint, p256dh: 'p', auth: 'a' },
    });

    const res = await request(app)
      .delete('/api/admin/push-subscriptions')
      .set(bearer(attacker.token))
      .send({ endpoint });
    expect(res.status).toBe(204); // idempotent no-op, not an error — see push.service.ts

    expect(await prisma.pushSubscription.count()).toBe(1);
    expect((await prisma.pushSubscription.findFirst())?.userID).toBe(victim.user.id);
  });

  it('is idempotent for an endpoint that was never saved', async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .delete('/api/admin/push-subscriptions')
      .set(bearer(token))
      .send({ endpoint: 'https://push.example/never-existed' });
    expect(res.status).toBe(204);
  });

  it('rejects anon (401) and a customer (403)', async () => {
    expect(
      (await request(app).delete('/api/admin/push-subscriptions').send({ endpoint: 'https://push.example/x' }))
        .status
    ).toBe(401);

    const { token } = await createCustomer();
    expect(
      (
        await request(app)
          .delete('/api/admin/push-subscriptions')
          .set(bearer(token))
          .send({ endpoint: 'https://push.example/x' })
      ).status
    ).toBe(403);
  });
});
