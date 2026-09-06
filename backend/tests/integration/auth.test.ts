import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';
import { REGISTER_MESSAGE } from '../../src/modules/auth/auth.controller';

// The mailer is the one real I/O boundary — mock it so the suite stays
// offline. Everything else (DB, token hashing, rate limiting) runs for real.
vi.mock('../../src/lib/mailer', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));

const app = buildApp();

const creds = { email: 'user@test.dev', password: 'Password123!' };

/** A full, valid registration body for the rewritten /register. */
function validRegisterBody(over: Record<string, unknown> = {}) {
  return {
    email: creds.email,
    password: creds.password,
    name: 'User',
    phone: '0791234567',
    address: {
      fullName: 'User',
      phone: '0791234567',
      addressLine: '12 Rainbow Street',
      city: 'Amman',
    },
    ...over,
  };
}

/** Registration doesn't create a session anymore — for tests that need a
 *  logged-in customer, make a verified user directly and hit /login. */
async function verifiedCustomer(email = creds.email) {
  return createUser({ role: 'CUSTOMER', email, password: creds.password, emailVerified: true });
}

async function loginSession(email = creds.email) {
  await verifiedCustomer(email);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ identifier: email, password: creds.password });
  expect(res.status).toBe(200);
  return { agent, accessToken: res.body.accessToken as string, cookie: res.headers['set-cookie'] };
}

describe('Auth API', () => {
  describe('register (email-verified customer signup)', () => {
    it('a brand-new email -> 201 generic message; unverified user + default address + a hashed verification token; email sent', async () => {
      const res = await request(app).post('/api/auth/register').send(validRegisterBody());
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message: REGISTER_MESSAGE });
      // No session — no token, no cookie.
      expect(res.body.accessToken).toBeUndefined();
      expect(res.headers['set-cookie']).toBeUndefined();

      const user = await prisma.user.findUnique({ where: { email: creds.email } });
      expect(user).toBeTruthy();
      expect(user!.role).toBe('CUSTOMER');
      expect(user!.emailVerified).toBeNull(); // unverified

      const addresses = await prisma.address.findMany({ where: { userID: user!.id } });
      expect(addresses).toHaveLength(1);
      expect(addresses[0]).toMatchObject({ city: 'Amman', isDefault: true });

      const tokens = await prisma.emailVerificationToken.findMany({ where: { userID: user!.id } });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex, never the raw token
      expect(tokens[0].usedAt).toBeNull();
      expect(tokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('an already-VERIFIED email -> 201 SAME message; no second user, no new address, no token, no email', async () => {
      await verifiedCustomer();
      const { sendVerificationEmail } = await import('../../src/lib/mailer');
      vi.mocked(sendVerificationEmail).mockClear();

      const res = await request(app).post('/api/auth/register').send(validRegisterBody());
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message: REGISTER_MESSAGE });

      expect(await prisma.user.count({ where: { email: creds.email } })).toBe(1);
      expect(await prisma.emailVerificationToken.count()).toBe(0);
      expect(await prisma.address.count()).toBe(0);
      expect(vi.mocked(sendVerificationEmail)).not.toHaveBeenCalled();
    });

    it('an existing UNVERIFIED email -> 201 SAME message; no duplicate user, but a FRESH token replaces the old one', async () => {
      const first = await request(app).post('/api/auth/register').send(validRegisterBody());
      expect(first.status).toBe(201);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: creds.email } });
      const originalToken = await prisma.emailVerificationToken.findFirstOrThrow({
        where: { userID: user.id },
      });

      const second = await request(app).post('/api/auth/register').send(validRegisterBody());
      expect(second.status).toBe(201);
      expect(second.body).toEqual({ message: REGISTER_MESSAGE });

      expect(await prisma.user.count({ where: { email: creds.email } })).toBe(1);
      const tokens = await prisma.emailVerificationToken.findMany({ where: { userID: user.id } });
      expect(tokens).toHaveLength(1); // old one deleted, one fresh
      expect(tokens[0].id).not.toBe(originalToken.id);
    });

    it("an email that's free but a phone that's taken -> 201 SAME message, no user created", async () => {
      await createUser({ role: 'CUSTOMER', email: 'someone@else.dev', phone: '0791234567', emailVerified: true });

      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegisterBody({ email: 'newcomer@test.dev' }));
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message: REGISTER_MESSAGE });
      expect(await prisma.user.count({ where: { email: 'newcomer@test.dev' } })).toBe(0);
    });

    it('a new email and an existing email produce responses within a comparable time band (Argon2 runs either way)', async () => {
      await verifiedCustomer('known@timing.dev');

      const timeOnce = async (email: string) => {
        const t0 = performance.now();
        await request(app).post('/api/auth/register').send(validRegisterBody({ email }));
        return performance.now() - t0;
      };

      const N = 4;
      let known = 0;
      let unknown = 0;
      for (let i = 0; i < N; i++) {
        known += await timeOnce('known@timing.dev');
        unknown += await timeOnce(`fresh-${i}@timing.dev`);
      }
      known /= N;
      unknown /= N;

      // Both pay a real Argon2 hash (tens of ms) and stay within a small factor.
      expect(known).toBeGreaterThan(8);
      expect(unknown).toBeGreaterThan(8);
      expect(known).toBeLessThan(unknown * 4);
      expect(unknown).toBeLessThan(known * 4);
    });

    it('a missing address -> 400 before any user is created', async () => {
      const { address, ...noAddress } = validRegisterBody();
      void address;
      const res = await request(app).post('/api/auth/register').send(noAddress);
      expect(res.status).toBe(400);
      expect(await prisma.user.count()).toBe(0);
    });

    it('a partial address (missing city) -> 400 before any user is created', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validRegisterBody({ address: { fullName: 'U', phone: '0791234567', addressLine: '12 St' } }));
      expect(res.status).toBe(400);
      expect(await prisma.user.count()).toBe(0);
    });

    it('400s a missing email / phone / name / short password', async () => {
      for (const bad of [
        validRegisterBody({ email: undefined }),
        validRegisterBody({ phone: undefined }),
        validRegisterBody({ name: '' }),
        validRegisterBody({ password: 'short' }),
      ]) {
        expect((await request(app).post('/api/auth/register').send(bad)).status).toBe(400);
      }
    });

    it('rate-limits registration per IP (11th -> 429) and per submitted email (4th -> 429)', async () => {
      const rlApp = buildApp({ customerRegisterRateLimit: true });

      // per-email: 3 / 15 min for the same address
      const perEmail: number[] = [];
      for (let i = 0; i < 4; i++) {
        perEmail.push(
          (await request(rlApp).post('/api/auth/register').send(validRegisterBody({ email: 'flood@rl.dev' }))).status
        );
      }
      expect(perEmail.slice(0, 3).every((s) => s === 201)).toBe(true);
      expect(perEmail[3]).toBe(429);

      // per-IP: 10 / 15 min across distinct addresses (first 6 already spent
      // above: 4 to flood@rl.dev + ... actually only 4). Fire 7 more distinct.
      const perIp: number[] = [];
      for (let i = 0; i < 8; i++) {
        perIp.push(
          (await request(rlApp).post('/api/auth/register').send(validRegisterBody({ email: `ip-${i}@rl.dev` }))).status
        );
      }
      expect(perIp).toContain(429); // the IP bucket (10) is exhausted within this run
    });
  });

  describe('login', () => {
    it('returns an access token for valid credentials', async () => {
      await verifiedCustomer();
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTypeOf('string');
    });

    it('BLOCKS an unverified customer with a specific 403, then lets them in once verified', async () => {
      await createUser({ role: 'CUSTOMER', email: creds.email, password: creds.password, emailVerified: false });

      const blocked = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
      expect(blocked.status).toBe(403);
      expect(blocked.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'Please verify your email address before signing in.' },
      });

      const audit = await prisma.auditLog.findMany({
        where: { entityType: 'auth', action: 'customer_login.email_unverified' },
      });
      expect(audit).toHaveLength(1);

      // verify, then login works
      await prisma.user.update({ where: { email: creds.email }, data: { emailVerified: new Date() } });
      const ok = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
      expect(ok.status).toBe(200);
    });

    it('an unverified account with a WRONG password still gets the generic 401 (not the verify hint)', async () => {
      await createUser({ role: 'CUSTOMER', email: creds.email, password: creds.password, emailVerified: false });
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: 'wrongpass12' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    });

    it('401s a wrong password', async () => {
      await verifiedCustomer();
      const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('locks the account after 5 failed attempts, then rejects even the right password — with the same generic 401 (no lock disclosure)', async () => {
      await verifiedCustomer();
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/auth/login').send({ identifier: creds.email, password: 'wrong' });
      }
      const locked = await request(app)
        .post('/api/auth/login')
        .send({ identifier: creds.email, password: creds.password });
      expect(locked.status).toBe(401);
      expect(locked.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });

      const user = await prisma.user.findUnique({ where: { email: creds.email } });
      expect(user?.failedLoginAttempts).toBeGreaterThanOrEqual(5);
      expect(user?.lockedUntil).not.toBeNull();
    });

    it('an unknown identifier and a wrong password return byte-identical responses (no enumeration)', async () => {
      await verifiedCustomer();
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
      await verifiedCustomer();
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
      expect(success.actorID).toBeTruthy();
      expect(success.metadata).toMatchObject({ identifier: creds.email, userAgent: 'jest-suite' });
      expect((success.metadata as { ip?: string }).ip).toBeTruthy();
      expect(rows[0].actorID).toBeNull();
    });

    it('a lock that already stands is recorded distinctly in the audit log', async () => {
      await verifiedCustomer();
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
      await createUser({ role: 'CUSTOMER', email: creds.email, password: creds.password, emailVerified: true });

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
      await verifiedCustomer();

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
      const { cookie } = await loginSession();

      const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
      expect(first.status).toBe(200);

      const active = await prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(active).toBe(1); // old revoked, one new issued
    });

    it('detects reuse of an already-rotated token and revokes the whole family', async () => {
      const { cookie } = await loginSession();

      await request(app).post('/api/auth/refresh').set('Cookie', cookie); // rotates
      const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookie); // reuse
      expect(replay.status).toBe(401);

      const active = await prisma.refreshToken.count({ where: { revokedAt: null } });
      expect(active).toBe(0);
    });

    it('logout revokes the refresh token', async () => {
      const { cookie } = await loginSession();
      const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
      expect(res.status).toBe(204);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });
  });
});
