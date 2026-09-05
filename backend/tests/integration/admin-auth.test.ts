import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser } from '../helpers/auth';

const app = buildApp(); // admin-login rate limiter off (test default)

const ADMIN_EMAIL = 'ada.admin@alistore.test';
const STAFF_EMAIL = 'sam.staff@alistore.test';
const CUSTOMER_EMAIL = 'chris.customer@alistore.test';
const PASSWORD = 'Sup3rSecret!';

let adminId: string;

beforeEach(async () => {
  const admin = await createUser({ role: 'ADMIN', email: ADMIN_EMAIL, password: PASSWORD });
  adminId = admin.user.id;
  await createUser({ role: 'STAFF', email: STAFF_EMAIL, password: PASSWORD });
  await createUser({ role: 'CUSTOMER', email: CUSTOMER_EMAIL, password: PASSWORD });
});

const adminLogin = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/admin-login').send(body);

/** The Set-Cookie flags, minus the token value, for comparison. */
const cookieFlags = (setCookie: string[] | undefined) => {
  const c = (setCookie ?? []).find((x) => x.startsWith('refreshToken='));
  if (!c) return null;
  return c
    .split(';')
    .slice(1)
    .map((s) => s.trim())
    .sort();
};

const adminLogEntries = () =>
  prisma.auditLog.findMany({
    where: { action: { startsWith: 'admin_login.' } },
    orderBy: { createdAt: 'asc' },
  });

describe('POST /api/auth/admin-login', () => {
  it('valid ADMIN credentials → 200 with an access token + refresh cookie', async () => {
    const res = await adminLogin({ identifier: ADMIN_EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.headers['set-cookie'].join(';')).toContain('refreshToken=');
  });

  it('valid STAFF credentials → 200 (staff may use the admin panel)', async () => {
    const res = await adminLogin({ identifier: STAFF_EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
  });

  it('the refresh cookie carries the same flags as customer login (httpOnly / SameSite=Strict / Path=/api/auth, no Secure in dev)', async () => {
    const adminRes = await adminLogin({ identifier: ADMIN_EMAIL, password: PASSWORD });
    const customerRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: CUSTOMER_EMAIL, password: PASSWORD });

    const flags = cookieFlags(adminRes.headers['set-cookie']);
    expect(flags).toEqual(cookieFlags(customerRes.headers['set-cookie']));
    expect(flags).toContain('HttpOnly');
    expect(flags).toContain('SameSite=Strict');
    expect(flags).toContain('Path=/api/auth');
    expect(flags).not.toContain('Secure'); // NODE_ENV=test → not production
  });

  it('valid password but non-admin role → 401 "Invalid credentials", no cookie', async () => {
    const res = await adminLogin({ identifier: CUSTOMER_EMAIL, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('wrong password, unknown identifier, and wrong role return byte-identical responses', async () => {
    const wrongPassword = await adminLogin({ identifier: ADMIN_EMAIL, password: 'nope' });
    const unknownUser = await adminLogin({ identifier: 'ghost@nowhere.test', password: PASSWORD });
    const wrongRole = await adminLogin({ identifier: CUSTOMER_EMAIL, password: PASSWORD });

    for (const res of [wrongPassword, unknownUser, wrongRole]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      });
    }
    expect(wrongPassword.body).toEqual(unknownUser.body);
    expect(unknownUser.body).toEqual(wrongRole.body);
  });

  it('400s a malformed body (missing password)', async () => {
    const res = await adminLogin({ identifier: ADMIN_EMAIL });
    expect(res.status).toBe(400);
  });

  describe('account lockout', () => {
    it('locks after 5 failures; a correct password is then still rejected until the lock expires', async () => {
      for (let i = 0; i < 5; i++) {
        const r = await adminLogin({ identifier: ADMIN_EMAIL, password: 'wrong' });
        expect(r.status).toBe(401);
      }

      const locked = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
      expect(locked.failedLoginAttempts).toBeGreaterThanOrEqual(5);
      expect(locked.lockedUntil).not.toBeNull();
      expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

      // correct password, but the account is locked → same generic 401
      const whileLocked = await adminLogin({ identifier: ADMIN_EMAIL, password: PASSWORD });
      expect(whileLocked.status).toBe(401);
      expect(whileLocked.body.error.message).toBe('Invalid credentials');

      // the locked path does not keep advancing the counter
      const stillLocked = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
      expect(stillLocked.failedLoginAttempts).toBe(locked.failedLoginAttempts);

      // fast-forward past the lock → correct password now succeeds and resets
      await prisma.user.update({
        where: { id: adminId },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      const afterExpiry = await adminLogin({ identifier: ADMIN_EMAIL, password: PASSWORD });
      expect(afterExpiry.status).toBe(200);

      const unlocked = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
      expect(unlocked.failedLoginAttempts).toBe(0);
      expect(unlocked.lockedUntil).toBeNull();
    });

    it('a correct password from a non-admin does not lock that account', async () => {
      for (let i = 0; i < 5; i++) {
        await adminLogin({ identifier: CUSTOMER_EMAIL, password: PASSWORD });
      }
      const customer = await prisma.user.findUniqueOrThrow({ where: { email: CUSTOMER_EMAIL } });
      expect(customer.failedLoginAttempts).toBe(0);
      expect(customer.lockedUntil).toBeNull();
    });
  });

  it('rate-limits rapid attempts from one IP (6th request → 429)', async () => {
    const throttledApp = buildApp({ adminLoginRateLimit: true });
    const hit = () =>
      request(throttledApp)
        .post('/api/auth/admin-login')
        .send({ identifier: 'ghost@nowhere.test', password: 'whatever' });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await hit()).status);

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  describe('audit log', () => {
    it('writes one entry per attempt with the correct outcome, identifier, ip and user-agent', async () => {
      await adminLogin({ identifier: ADMIN_EMAIL, password: PASSWORD }); // success
      await adminLogin({ identifier: ADMIN_EMAIL, password: 'wrong' }); // invalid_credentials
      await adminLogin({ identifier: 'ghost@nowhere.test', password: PASSWORD }); // invalid_credentials (unknown)
      await adminLogin({ identifier: CUSTOMER_EMAIL, password: PASSWORD }); // not_admin

      const logs = await adminLogEntries();
      expect(logs).toHaveLength(4);

      const outcomes = logs.map((l) => (l.metadata as Record<string, unknown>).outcome);
      expect(outcomes).toEqual(['success', 'invalid_credentials', 'invalid_credentials', 'not_admin']);

      for (const l of logs) {
        const m = l.metadata as Record<string, unknown>;
        expect(l.action).toBe(`admin_login.${m.outcome}`);
        expect(m.ip).toBeTypeOf('string');
        expect((m.ip as string).length).toBeGreaterThan(0);
        expect(m.userAgent).toBeTypeOf('string');
        expect(m.identifier).toBeTypeOf('string');
      }

      // success is attributed to the acting user; failures are not
      const success = logs[0];
      expect(success.action).toBe('admin_login.success');
      expect(success.actorID).toBe(adminId);
      expect(success.entityID).toBe(adminId);
      expect((success.metadata as Record<string, unknown>).identifier).toBe(ADMIN_EMAIL);

      const unknown = logs[2];
      expect(unknown.actorID).toBeNull();
      expect(unknown.entityID).toBeNull(); // no user matched
    });

    it('records a locked-out attempt distinctly in the audit log', async () => {
      for (let i = 0; i < 5; i++) await adminLogin({ identifier: ADMIN_EMAIL, password: 'wrong' });
      await adminLogin({ identifier: ADMIN_EMAIL, password: PASSWORD }); // locked

      const logs = await adminLogEntries();
      const outcomes = logs.map((l) => (l.metadata as Record<string, unknown>).outcome);
      expect(outcomes).toEqual([
        'invalid_credentials',
        'invalid_credentials',
        'invalid_credentials',
        'invalid_credentials',
        'invalid_credentials',
        'locked_out',
      ]);
      expect(logs[5].action).toBe('admin_login.locked_out');
      expect(logs[5].entityID).toBe(adminId); // the targeted account is known
      expect(logs[5].actorID).toBeNull(); // but nobody successfully acted
    });
  });

  it('does not affect the customer POST /api/auth/login (no regression)', async () => {
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ identifier: CUSTOMER_EMAIL, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTypeOf('string');

    const bad = await request(app)
      .post('/api/auth/login')
      .send({ identifier: CUSTOMER_EMAIL, password: 'wrong' });
    expect(bad.status).toBe(401);

    // a customer logging in the normal way is not audited by the admin flow
    expect(await adminLogEntries()).toHaveLength(0);
  });

  describe('access-token TTL', () => {
    const ttl = (jwtToken: string) => {
      const [, payload] = jwtToken.split('.');
      const { iat, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return exp - iat;
    };

    it('an admin token is shorter-lived than a customer token (5 min vs 15 min)', async () => {
      const admin = await adminLogin({ identifier: ADMIN_EMAIL, password: PASSWORD });
      const customer = await request(app)
        .post('/api/auth/login')
        .send({ identifier: CUSTOMER_EMAIL, password: PASSWORD });

      expect(ttl(admin.body.accessToken)).toBe(5 * 60);
      expect(ttl(customer.body.accessToken)).toBe(15 * 60);
    });

    it('a STAFF login (via admin-login) also gets the short admin TTL', async () => {
      const staff = await request(app)
        .post('/api/auth/admin-login')
        .send({ identifier: STAFF_EMAIL, password: PASSWORD });
      expect(staff.status).toBe(200);
      expect(ttl(staff.body.accessToken)).toBe(5 * 60);
    });

    it('silent refresh of an admin session keeps issuing short-lived tokens', async () => {
      const login = await adminLogin({ identifier: ADMIN_EMAIL, password: PASSWORD });
      const cookie = login.headers['set-cookie'];

      const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
      expect(refreshed.status).toBe(200);
      expect(ttl(refreshed.body.accessToken)).toBe(5 * 60);
    });
  });
});
