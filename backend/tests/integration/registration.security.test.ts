import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser, bearer, createAdmin } from '../helpers/auth';
import { REGISTER_MESSAGE } from '../../src/modules/auth/auth.controller';

vi.mock('../../src/lib/mailer', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));
import { sendVerificationEmail } from '../../src/lib/mailer';
const mockSend = vi.mocked(sendVerificationEmail);

const app = buildApp();
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

const regBody = (over: Record<string, unknown> = {}) => ({
  email: 'attacker@sec.test',
  password: 'Password123!',
  name: 'Attacker',
  address: { phone: '0791234567', addressLine: '1 Dark Alley', city: 'Amman' },
  ...over,
});

const GENERIC_201 = { message: REGISTER_MESSAGE };
const GENERIC_VERIFY_401 = {
  error: { code: 'UNAUTHORIZED', message: 'Invalid or expired verification link' },
};

/** Register a fresh user and hand back their live raw verification token. */
async function registerAndToken(email: string) {
  mockSend.mockClear();
  const res = await request(app).post('/api/auth/register').send(regBody({ email }));
  expect(res.status).toBe(201);
  const url = mockSend.mock.calls.at(-1)?.[1] as string;
  return new URL(url).searchParams.get('token')!;
}

beforeEach(() => mockSend.mockClear());

describe('register — no account-existence oracle', () => {
  it('new / existing-unverified / existing-verified all return an identical 201 body', async () => {
    // existing verified
    await createUser({ role: 'CUSTOMER', email: 'verified@sec.test', password: 'Password123!', emailVerified: true });
    // existing unverified
    await createUser({ role: 'CUSTOMER', email: 'unverified@sec.test', password: 'Password123!', emailVerified: false });

    const results = [
      await request(app).post('/api/auth/register').send(regBody({ email: 'brand-new@sec.test' })),
      await request(app).post('/api/auth/register').send(regBody({ email: 'verified@sec.test' })),
      await request(app).post('/api/auth/register').send(regBody({ email: 'unverified@sec.test' })),
    ];
    for (const r of results) {
      expect(r.status).toBe(201);
      expect(r.body).toEqual(GENERIC_201);
      expect(r.headers['set-cookie']).toBeUndefined();
    }
    expect(new Set(results.map((r) => JSON.stringify(r.body))).size).toBe(1);

    // side effects match the docs: a verified account gets no email/user/address
    expect(await prisma.user.count({ where: { email: 'verified@sec.test' } })).toBe(1);
    expect(await prisma.user.count({ where: { email: 'brand-new@sec.test' } })).toBe(1);
  });

  it('a verified-account register does no DB writes; a new one does — but the Argon2 hash dominates the timing', async () => {
    await createUser({ role: 'CUSTOMER', email: 'known@t.sec', password: 'Password123!', emailVerified: true });

    const timeOnce = async (email: string) => {
      const t0 = performance.now();
      await request(app).post('/api/auth/register').send(regBody({ email }));
      return performance.now() - t0;
    };
    const N = 5;
    let known = 0;
    let fresh = 0;
    for (let i = 0; i < N; i++) {
      known += await timeOnce('known@t.sec');
      fresh += await timeOnce(`fresh-${i}@t.sec`);
    }
    known /= N;
    fresh /= N;
    // A real Argon2 hash runs on both (tens of ms); the DB-write delta is
    // small next to it. Stay within a small factor either way.
    expect(known).toBeGreaterThan(8);
    expect(fresh).toBeGreaterThan(8);
    expect(known).toBeLessThan(fresh * 3);
    expect(fresh).toBeLessThan(known * 3);
  });
});

describe('register — cannot be coerced into privilege / cross-user writes', () => {
  it('strips role / isActive / emailVerified / id from the body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(
        regBody({
          role: 'ADMIN',
          isActive: false,
          emailVerified: '2000-01-01T00:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000123',
          failedLoginAttempts: -999,
        })
      );
    expect(res.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'attacker@sec.test' } });
    expect(u.role).toBe('CUSTOMER');
    expect(u.isActive).toBe(true);
    expect(u.emailVerified).toBeNull();
    expect(u.id).not.toBe('00000000-0000-4000-8000-000000000123');
    expect(u.failedLoginAttempts).toBe(0);
  });

  it('strips address.userID / address.isDefault / address.id — the address binds to the new user, default forced', async () => {
    const victim = await createUser({ role: 'CUSTOMER', email: 'victim@sec.test', emailVerified: true });
    const res = await request(app)
      .post('/api/auth/register')
      .send(
        regBody({
          email: 'attacker2@sec.test',
          address: {
            phone: '0791234567',
            addressLine: '1 St',
            city: 'Amman',
            userID: victim.user.id,
            isDefault: false,
            id: '00000000-0000-4000-8000-000000000999',
            fullName: 'Injected Name',
          },
        })
      );
    expect(res.status).toBe(201);
    const attacker = await prisma.user.findUniqueOrThrow({ where: { email: 'attacker2@sec.test' } });
    const addrs = await prisma.address.findMany({ where: { userID: attacker.id } });
    expect(addrs).toHaveLength(1);
    expect(addrs[0].isDefault).toBe(true); // forced
    expect(addrs[0].fullName).toBe('Attacker'); // defaulted to name, not the injected value
    // victim gained nothing
    expect(await prisma.address.count({ where: { userID: victim.user.id } })).toBe(0);
  });

  it('a __proto__ payload in the body does not pollute Object.prototype', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('content-type', 'application/json')
      .send(
        `{"email":"proto@sec.test","password":"Password123!","name":"P","address":{"phone":"0791234567","addressLine":"1 St","city":"Amman"},"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}`
      );
    expect(res.status).toBe(201);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('an authenticated caller cannot register a privileged account either', async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post('/api/auth/register')
      .set(bearer(token))
      .send(regBody({ email: 'evenadmin@sec.test', role: 'ADMIN' }));
    expect(res.status).toBe(201);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: 'evenadmin@sec.test' } });
    expect(u.role).toBe('CUSTOMER');
  });

  it("registering an existing user's email never touches their password, role, or name", async () => {
    const original = await createUser({
      role: 'ADMIN',
      email: 'target@sec.test',
      password: 'TheRealAdminPassword1!',
      name: 'Real Admin',
      emailVerified: true,
    });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: original.user.id } });

    const res = await request(app)
      .post('/api/auth/register')
      .send(regBody({ email: 'target@sec.test', password: 'HijackAttempt123!', name: 'Not Admin' }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual(GENERIC_201);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: original.user.id } });
    expect(after.passwordHash).toBe(before.passwordHash); // NOT overwritten
    expect(after.role).toBe('ADMIN');
    expect(after.name).toBe('Real Admin');
    expect(after.emailVerified).toEqual(before.emailVerified);
    // the admin's real password still works at the admin door
    const adminLogin = await request(app)
      .post('/api/auth/ali-admin-login')
      .send({ identifier: 'target@sec.test', password: 'TheRealAdminPassword1!' });
    expect(adminLogin.status).toBe(200);
  });

  it('email casing cannot create a duplicate account, and login matches regardless of case', async () => {
    const r1 = await request(app).post('/api/auth/register').send(regBody({ email: 'Case.Test@Example.COM' }));
    expect(r1.status).toBe(201);
    const stored = await prisma.user.findMany({ where: { email: { contains: 'case.test' } } });
    expect(stored).toHaveLength(1);
    expect(stored[0].email).toBe('case.test@example.com'); // normalised on write

    // a second register with different casing hits the existing-account branch
    const r2 = await request(app).post('/api/auth/register').send(regBody({ email: 'CASE.TEST@example.com' }));
    expect(r2.status).toBe(201);
    expect(await prisma.user.count({ where: { email: { contains: 'case.test' } } })).toBe(1);

    // verify + login with yet another casing
    await prisma.user.update({ where: { id: stored[0].id }, data: { emailVerified: new Date() } });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'cAsE.tEsT@ExAmPlE.cOm', password: 'Password123!' });
    expect(login.status).toBe(200);
  });
});

describe('verify-email — token cannot be guessed, replayed, or fuzzed into a 500', () => {
  it('garbage / used / expired tokens all return the same generic 401', async () => {
    const t1 = await registerAndToken('vt1@sec.test');
    await request(app).post('/api/auth/verify-email').send({ token: t1 }); // consume it

    const t2 = await registerAndToken('vt2@sec.test');
    await prisma.emailVerificationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const responses = [
      await request(app).post('/api/auth/verify-email').send({ token: t1 }), // used
      await request(app).post('/api/auth/verify-email').send({ token: t2 }), // expired
      await request(app).post('/api/auth/verify-email').send({ token: 'never-existed' }), // unknown
      await request(app).post('/api/auth/verify-email').send({ token: hash('x') }), // looks like a hash
    ];
    for (const r of responses) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual(GENERIC_VERIFY_401);
    }
    expect(new Set(responses.map((r) => JSON.stringify(r.body))).size).toBe(1);
  });

  it("consuming a token verifies ONLY that token's own user", async () => {
    await registerAndToken('owner@sec.test');
    const other = await createUser({ role: 'CUSTOMER', email: 'bystander@sec.test', emailVerified: false });
    const token = await registerAndToken('owner@sec.test'); // fresh token for owner

    await request(app).post('/api/auth/verify-email').send({ token });

    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'owner@sec.test' } })).emailVerified).not.toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } })).emailVerified).toBeNull();
  });

  it('SQL-ish / control-char / huge tokens are 400 or generic 401 — never a 500', async () => {
    for (const token of [
      "' OR '1'='1",
      "'; DROP TABLE emailverificationtoken; --",
      ' ',
      'x'.repeat(513), // over the schema max
      '../../etc/passwd',
    ]) {
      const r = await request(app).post('/api/auth/verify-email').send({ token });
      expect([400, 401]).toContain(r.status);
    }
  });

  it('a 200 KB token body is rejected before any work (413, not 500)', async () => {
    const r = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'x'.repeat(200_000) });
    expect([400, 413]).toContain(r.status);
  });
});

describe('login gate — an unverified account has no path to a session', () => {
  it('register -> (no token) -> login is 403; the account holds no refresh token', async () => {
    await request(app).post('/api/auth/register').send(regBody({ email: 'gate@sec.test' }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'gate@sec.test' } });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'gate@sec.test', password: 'Password123!' });
    expect(login.status).toBe(403);
    expect(login.body.error.message).toMatch(/verify your email/i);
    expect(login.headers['set-cookie']).toBeUndefined();

    expect(await prisma.refreshToken.count({ where: { userID: user.id } })).toBe(0);
  });

  it('verify-email issues no session (no token, no cookie), and refresh with no cookie is 401', async () => {
    const token = await registerAndToken('gate2@sec.test');
    const verify = await request(app).post('/api/auth/verify-email').send({ token });
    expect(verify.status).toBe(200);
    expect(verify.body.accessToken).toBeUndefined();
    expect(verify.headers['set-cookie']).toBeUndefined();

    const refresh = await request(app).post('/api/auth/refresh').send({});
    expect(refresh.status).toBe(401);
  });

  it('an unverified account with a WRONG password still gets the plain 401 (no verify hint leaked)', async () => {
    await createUser({ role: 'CUSTOMER', email: 'wrongpw@sec.test', password: 'Password123!', emailVerified: false });
    const r = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'wrongpw@sec.test', password: 'nope-nope-12' });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  });

  it('the email-verification gate never fires for an ADMIN (refused earlier as privileged)', async () => {
    await createUser({
      role: 'ADMIN',
      email: 'unv.admin@sec.test',
      password: 'Password123!',
      emailVerified: false,
    });
    const r = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'unv.admin@sec.test', password: 'Password123!' });
    // "Invalid credentials" (privileged_denied) — NOT the 403 "verify your email" hint
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
  });
});

describe('resend-verification — no oracle, only real unverified accounts get mail', () => {
  it('unknown / verified / unverified all return the same generic 200 body', async () => {
    await createUser({ role: 'CUSTOMER', email: 'r-verified@sec.test', emailVerified: true });
    await createUser({ role: 'CUSTOMER', email: 'r-unverified@sec.test', password: 'Password123!', emailVerified: false });

    const bodies: string[] = [];
    for (const email of ['r-unknown@sec.test', 'r-verified@sec.test', 'r-unverified@sec.test']) {
      const r = await request(app).post('/api/auth/resend-verification').send({ email });
      expect(r.status).toBe(200);
      bodies.push(JSON.stringify(r.body));
    }
    expect(new Set(bodies).size).toBe(1);
    // only the genuinely-unverified account triggered an email
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
