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

    it('locks the account after 5 failed attempts, then rejects even the right password — with the same generic 401 (no lock disclosure)', async () => {
      await register();
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ identifier: creds.email, password: 'wrong' });
      }
      const locked = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
      // Generic 401 "Invalid credentials" — NOT a 403 / "account locked" that
      // would confirm the account exists.
      expect(locked.status).toBe(401);
      expect(locked.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });

      const user = await prisma.user.findUnique({ where: { email: creds.email } });
      expect(user?.failedLoginAttempts).toBeGreaterThanOrEqual(5);
      expect(user?.lockedUntil).not.toBeNull();
    });

    it('an unknown identifier and a wrong password return byte-identical responses (no enumeration)', async () => {
      await register();
      const unknown = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'nobody@nowhere.dev', password: 'whatever12' });
      const wrongPw = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: 'wrongpass12' });

      expect(unknown.status).toBe(401);
      expect(wrongPw.status).toBe(401);
      expect(unknown.body).toEqual(wrongPw.body);
    });

    it('caps the identifier and password lengths (400, never reaches Argon2)', async () => {
      const long = 'x'.repeat(1000);
      const a = await request(app).post('/api/auth/login').send({ identifier: `${long}@x.dev`, password: 'p' });
      const b = await request(app).post('/api/auth/login').send({ identifier: 'a@x.dev', password: long });
      expect(a.status).toBe(400);
      expect(b.status).toBe(400);
    });

    it('writes an audit-log row for each attempt with its outcome, identifier, ip and user-agent', async () => {
      await register();
      await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'jest-suite')
        .send({ identifier: creds.email, password: 'wrong' });
      await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'jest-suite')
        .send({ identifier: creds.email, password: creds.password });

      const rows = await prisma.auditLog.findMany({
        where: { entityType: 'auth', action: { startsWith: 'customer_login.' } },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.action)).toEqual([
        'customer_login.invalid_credentials',
        'customer_login.success',
      ]);
      const success = rows[1];
      expect(success.actorID).toBeTruthy(); // set only on success
      expect(success.metadata).toMatchObject({ identifier: creds.email, userAgent: 'jest-suite' });
      expect((success.metadata as { ip?: string }).ip).toBeTruthy();
      // the failure row is not attributed to an actor
      expect(rows[0].actorID).toBeNull();
    });

    it('a lock that already stands is recorded distinctly in the audit log', async () => {
      await register();
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/auth/login').send({ identifier: creds.email, password: 'wrong' });
      }
      await request(app).post('/api/auth/login').send({ identifier: creds.email, password: creds.password });

      const actions = (
        await prisma.auditLog.findMany({
          where: { entityType: 'auth', action: { startsWith: 'customer_login.' } },
        })
      ).map((r) => r.action);
      expect(actions).toContain('customer_login.locked_out');
    });

    it('rate-limits rapid attempts from one IP (11th request → 429)', async () => {
      const rlApp = buildApp({ customerLoginRateLimit: true });
      await request(rlApp).post('/api/auth/register').send({ name: 'RL', ...creds });

      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push(
          (await request(rlApp).post('/api/auth/login').send({ identifier: creds.email, password: 'wrong' })).status
        );
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
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
