import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../../src/app';
import { env, assertStrongSecret, assertStrongSecrets } from '../../src/config/env';
import { prisma } from '../../src/config/prisma';
import { createUser, createAdmin, createCustomer, bearer } from '../helpers/auth';

const app = buildApp();
const DASH = '/api/admin/dashboard'; // requireAuth + requireRole(ADMIN) — probe for forged-token attacks
const adminLogin = (body: unknown) => request(app).post('/api/auth/ali-admin-login').send(body);

const EMAIL = 'sec.admin@alistore.test';
const PW = 'C0rrectHorseBatteryStaple!';
let adminId: string;

beforeEach(async () => {
  const a = await createUser({ role: 'ADMIN', email: EMAIL, password: PW });
  adminId = a.user.id;
});

describe('admin auth — JWT hardening (forged-token attacks against /api/admin)', () => {
  it('accepts a legitimately-signed HS256 admin token (baseline)', async () => {
    const { token } = await createAdmin();
    expect((await request(app).get(DASH).set(bearer(token))).status).toBe(200);
  });

  it('rejects an unsigned "alg:none" token', async () => {
    const forged = jwt.sign({ id: adminId, role: 'ADMIN' }, '', { algorithm: 'none' });
    expect((await request(app).get(DASH).set(bearer(forged))).status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ id: adminId, role: 'ADMIN' }, randomBytes(32).toString('hex'), {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    expect((await request(app).get(DASH).set(bearer(forged))).status).toBe(401);
  });

  it('rejects a token whose payload was edited after signing (role escalation)', async () => {
    const { token } = await createCustomer(); // role: CUSTOMER
    const [h, p, s] = token.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    claims.role = 'ADMIN';
    const forged = `${h}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${s}`;
    expect((await request(app).get(DASH).set(bearer(forged))).status).toBe(401);
  });

  it('rejects an algorithm-substituted token (HS512 with the real secret)', async () => {
    // Without a pinned `algorithms` list, jsonwebtoken accepts any HS* the
    // token header asks for. It must not.
    const forged = jwt.sign({ id: adminId, role: 'ADMIN' }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS512',
      expiresIn: '15m',
    });
    expect((await request(app).get(DASH).set(bearer(forged))).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const forged = jwt.sign({ id: adminId, role: 'ADMIN' }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: -10,
    });
    expect((await request(app).get(DASH).set(bearer(forged))).status).toBe(401);
  });

  it('rejects a missing / malformed Authorization header', async () => {
    expect((await request(app).get(DASH)).status).toBe(401);
    expect((await request(app).get(DASH).set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
    expect((await request(app).get(DASH).set('Authorization', 'Basic abc')).status).toBe(401);
  });

  it('the token issued on admin-login is HS256 and carries no secret material', async () => {
    const res = await adminLogin({ identifier: EMAIL, password: PW });
    expect(res.status).toBe(200);
    const decoded = jwt.decode(res.body.accessToken, { complete: true });
    expect(decoded?.header.alg).toBe('HS256');
    // `auth_time` (step-up freshness, S2) is a plain unix timestamp — no
    // secret material, same as iat/exp.
    expect(Object.keys(decoded?.payload as object).sort()).toEqual([
      'auth_time',
      'exp',
      'iat',
      'id',
      'role',
    ]);
  });
});

describe('admin auth — no credential oracle', () => {
  it('unknown user / wrong password / wrong role / locked account all return an identical response', async () => {
    await createUser({ role: 'CUSTOMER', email: 'cust@sec.test', password: PW });
    const locked = await createUser({ role: 'ADMIN', email: 'locked@sec.test', password: PW });
    await prisma.user.update({
      where: { id: locked.user.id },
      data: { failedLoginAttempts: 9, lockedUntil: new Date(Date.now() + 60_000) },
    });

    const results = [
      await adminLogin({ identifier: 'ghost@sec.test', password: PW }), // unknown
      await adminLogin({ identifier: EMAIL, password: 'wrong-password' }), // wrong pw
      await adminLogin({ identifier: 'cust@sec.test', password: PW }), // valid pw, wrong role
      await adminLogin({ identifier: 'locked@sec.test', password: PW }), // locked
    ];

    for (const r of results) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
      expect(r.headers['set-cookie']).toBeUndefined();
    }
    expect(new Set(results.map((r) => JSON.stringify(r.body))).size).toBe(1);
  });

  it('has no fast path for an unknown identifier — Argon2 runs either way', async () => {
    const timeOnce = async (body: unknown) => {
      const t0 = performance.now();
      await adminLogin(body);
      return performance.now() - t0;
    };

    const N = 5;
    let unknown = 0;
    let wrongPw = 0;
    for (let i = 0; i < N; i++) {
      unknown += await timeOnce({ identifier: `ghost${i}@sec.test`, password: PW });
      wrongPw += await timeOnce({ identifier: EMAIL, password: `wrong-${i}` });
    }
    unknown /= N;
    wrongPw /= N;

    // A "user not found → 401" bail would be ~sub-millisecond; a real Argon2
    // verify is tens of ms. And the two paths stay within a small factor.
    expect(unknown).toBeGreaterThan(8);
    expect(unknown).toBeLessThan(wrongPw * 4);
    expect(wrongPw).toBeLessThan(unknown * 4);
  });
});

describe('admin auth — input hardening', () => {
  it('a 200 KB password body is rejected before any hashing (413, not a 500)', async () => {
    const res = await adminLogin({ identifier: EMAIL, password: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
    });
  });

  it('a malformed JSON body is a clean 400, not a 500', async () => {
    const res = await request(app)
      .post('/api/auth/ali-admin-login')
      .set('content-type', 'application/json')
      .send('{"identifier": "a", "password":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('a password past the schema max is a 400 (no Argon2 verify)', async () => {
    const res = await adminLogin({ identifier: EMAIL, password: 'x'.repeat(300) });
    expect(res.status).toBe(400);
  });

  it('an over-long identifier is a 400', async () => {
    const res = await adminLogin({ identifier: `${'a'.repeat(400)}@x.test`, password: PW });
    expect(res.status).toBe(400);
  });

  it('extra body fields cannot escalate and do not pollute Object.prototype', async () => {
    const escalate = await request(app).post('/api/auth/ali-admin-login').send({
      identifier: 'cust2@sec.test',
      password: PW,
      role: 'ADMIN',
      isAdmin: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
    expect(escalate.status).toBe(401); // still no such user; the extra fields did nothing

    const pollute = await request(app)
      .post('/api/auth/ali-admin-login')
      .set('content-type', 'application/json')
      .send(
        `{"identifier":"${EMAIL}","password":"wrong","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}`
      );
    expect(pollute.status).toBe(401);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('admin auth — rate limit cannot be spoofed away', () => {
  it('rotating X-Forwarded-For does not bypass the per-IP limit (trust proxy off in non-prod)', async () => {
    const throttled = buildApp({ adminLoginRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(throttled)
        .post('/api/auth/ali-admin-login')
        .set('X-Forwarded-For', `10.20.30.${i}`)
        .send({ identifier: 'ghost@sec.test', password: 'nope' });
      statuses.push(r.status);
    }
    expect(statuses[5]).toBe(429);
  });
});

describe('admin auth — JWT signing-key strength guard', () => {
  it('assertStrongSecret rejects placeholders, short values, and low-entropy strings', () => {
    expect(() => assertStrongSecret('change-me-to-a-long-random-string', 'X')).toThrow();
    expect(() => assertStrongSecret('change-me-to-a-different-long-random-string', 'X')).toThrow();
    expect(() => assertStrongSecret('your-secret-here-your-secret-here!', 'X')).toThrow();
    expect(() => assertStrongSecret('too-short', 'X')).toThrow();
    expect(() => assertStrongSecret('a'.repeat(40), 'X')).toThrow(/variety/); // 1 distinct char
  });

  it('assertStrongSecret accepts a real random secret', () => {
    expect(() => assertStrongSecret(randomBytes(48).toString('base64url'), 'X')).not.toThrow();
  });

  it('assertStrongSecrets rejects an access secret equal to the refresh secret', () => {
    const s = randomBytes(48).toString('base64url');
    expect(() =>
      assertStrongSecrets({ JWT_ACCESS_SECRET: s, JWT_REFRESH_SECRET: s })
    ).toThrow(/different/);
  });
});

describe('admin auth — customer login regression', () => {
  it('POST /api/auth/login still issues a usable HS256 token', async () => {
    await createUser({ role: 'CUSTOMER', email: 'reg@sec.test', password: PW });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'reg@sec.test', password: PW });
    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.accessToken, { complete: true })?.header.alg).toBe('HS256');
  });
});
