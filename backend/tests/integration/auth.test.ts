import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

const app = buildApp();

const creds = { email: 'user@test.dev', password: 'Password123!' };

async function register(over: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/auth/register')
    .send({ name: 'User', ...creds, ...over });
}

describe('Auth API', () => {
  describe('register', () => {
    it('creates an account and returns an access token + refresh cookie', async () => {
      const res = await register();
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeTypeOf('string');
      expect(res.body.user).toMatchObject({ email: creds.email });
      expect(res.headers['set-cookie'].join(';')).toContain('refreshToken=');
    });

    it('409s a duplicate email', async () => {
      await register();
      const res = await register({ name: 'Dupe' });
      expect(res.status).toBe(409);
    });

    it('400s when neither email nor phone is given', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'X', password: 'Password123!' });
      expect(res.status).toBe(400);
    });

    it('400s a too-short password', async () => {
      const res = await register({ password: 'short' });
      expect(res.status).toBe(400);
    });
  });

  describe('login', () => {
    it('returns an access token for valid credentials', async () => {
      await register();
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTypeOf('string');
    });

    it('401s a wrong password', async () => {
      await register();
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('locks the account after 5 failed attempts (403 thereafter)', async () => {
      await register();
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ identifier: creds.email, password: 'wrong' });
      }
      const locked = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
      expect(locked.status).toBe(403);

      const user = await prisma.user.findUnique({ where: { email: creds.email } });
      expect(user?.failedLoginAttempts).toBeGreaterThanOrEqual(5);
      expect(user?.lockedUntil).not.toBeNull();
    });

    it('merges a guest cart into the user on login', async () => {
      const col = await makeCollection({ slug: 'c' });
      const cat = await makeCategory(col.id);
      const p = await makeProduct(col.id, cat.id, {
        variants: [{ sku: 'v', size: 'M', color: 'B', stockQuantity: 5 }],
      });
      await register();

      const agent = request.agent(app);
      await agent.post('/api/cart/items').send({ variantId: p.variants[0].id, quantity: 2 });

      const login = await agent
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
      expect(login.status).toBe(200);

      const cart = await agent.get('/api/cart').set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(cart.body.items).toHaveLength(1);
      expect(cart.body.items[0].quantity).toBe(2);
    });
  });

  describe('refresh + logout', () => {
    it('rotates the refresh token and revokes the old one', async () => {
      const reg = await register();
      const cookie = reg.headers['set-cookie'];

      const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
      expect(first.status).toBe(200);

      const active = await prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(active).toBe(1); // old revoked, one new issued
    });

    it('detects reuse of an already-rotated token and revokes the whole family', async () => {
      const reg = await register();
      const cookie = reg.headers['set-cookie'];

      await request(app).post('/api/auth/refresh').set('Cookie', cookie); // rotates
      const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie); // reuse
      expect(replay.status).toBe(401);

      const active = await prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(active).toBe(0);
    });

    it('logout revokes the refresh token', async () => {
      const reg = await register();
      const cookie = reg.headers['set-cookie'];
      const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
      expect(res.status).toBe(204);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });
  });
});
