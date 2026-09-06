import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { buildApp } from '../../src/app';
import { env } from '../../src/config/env';
import { prisma } from '../../src/config/prisma';
import { createUser, createAdmin, createCustomer, bearer } from '../helpers/auth';

const app = buildApp();

// A spread of staff/admin-only endpoints across modules — the whole point is
// that a CUSTOMER credential can't reach any of them.
const ADMIN_ENDPOINTS: [method: 'get' | 'post' | 'patch', path: string][] = [
  ['get', '/api/admin/dashboard'],
  ['get', '/api/admin/orders'],
  ['post', '/api/products'],
  ['patch', '/api/settings'],
  ['post', '/api/collections'],
];

const hit = (m: 'get' | 'post' | 'patch', p: string, token?: string) => {
  const r = request(app)[m](p);
  return token ? r.set(bearer(token)) : r;
};

const CUST_EMAIL = 'shopper@sec.test';
const ADMIN_EMAIL = 'boss@sec.test';
const PW = 'C0rrectHorseBatteryStaple!';

let adminId: string;
let customerId: string;

beforeEach(async () => {
  adminId = (await createUser({ role: 'ADMIN', email: ADMIN_EMAIL, password: PW })).user.id;
  customerId = (await createUser({ role: 'CUSTOMER', email: CUST_EMAIL, password: PW })).user.id;
});

describe('privilege escalation — a customer must never reach /api/admin/*', () => {
  it('a legit CUSTOMER access token is 403 on every admin endpoint (authenticated, wrong role)', async () => {
    const { token } = await createCustomer();
    for (const [m, p] of ADMIN_ENDPOINTS) {
      const res = await hit(m, p, token);
      expect(res.status, `${m.toUpperCase()} ${p}`).toBe(403);
    }
  });

  it('a CUSTOMER token with its role claim edited to ADMIN is rejected (signature)', async () => {
    const { token } = await createCustomer();
    const [h, p, s] = token.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    claims.role = 'ADMIN';
    const forged = `${h}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${s}`;
    for (const [m, path] of ADMIN_ENDPOINTS) {
      expect((await hit(m, path, forged)).status).toBe(401);
    }
  });

  it('a from-scratch HS256 "ADMIN" token signed with the wrong secret is rejected', async () => {
    const forged = jwt.sign({ id: customerId, role: 'ADMIN' }, randomBytes(32).toString('hex'), {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    expect((await hit('get', '/api/admin/dashboard', forged)).status).toBe(401);
  });

  it('alg:none, HS512-substitution, and expired tokens are all rejected', async () => {
    const none = jwt.sign({ id: adminId, role: 'ADMIN' }, '', { algorithm: 'none' });
    const hs512 = jwt.sign({ id: adminId, role: 'ADMIN' }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS512',
      expiresIn: '15m',
    });
    const expired = jwt.sign({ id: adminId, role: 'ADMIN' }, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: -10,
    });
    for (const tok of [none, hs512, expired]) {
      expect((await hit('get', '/api/admin/dashboard', tok)).status).toBe(401);
    }
  });

  it('a genuine ADMIN token still works (guard is not just blanket-denying)', async () => {
    const { token } = await createAdmin();
    expect((await hit('get', '/api/admin/dashboard', token)).status).toBe(200);
  });
});

describe('the customer login door is not a back way into a privileged account', () => {
  it('correct ADMIN credentials at POST /api/auth/login are refused (privileged accounts use /admin-login only)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: ADMIN_EMAIL, password: PW });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('wrong-password spray at the customer door cannot lock a privileged account out of /admin-login', async () => {
    for (let i = 0; i < 8; i++) {
      await request(app).post('/api/auth/login').send({ identifier: ADMIN_EMAIL, password: `nope-${i}` });
    }
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    expect(admin?.failedLoginAttempts).toBe(0);
    expect(admin?.lockedUntil).toBeNull();

    // and admin-login still works
    const ok = await request(app)
      .post('/api/auth/ali-admin-login')
      .send({ identifier: ADMIN_EMAIL, password: PW });
    expect(ok.status).toBe(200);
  });

  it('the refused privileged attempt is recorded distinctly in the audit log', async () => {
    await request(app).post('/api/auth/login').send({ identifier: ADMIN_EMAIL, password: PW });
    const rows = await prisma.auditLog.findMany({
      where: { entityType: 'auth', action: { startsWith: 'customer_login.' } },
    });
    expect(rows.map((r) => r.action)).toContain('customer_login.privileged_denied');
  });

  it('an unknown identifier, a wrong customer password, and a valid-but-privileged credential are byte-identical', async () => {
    const bodies = [
      (await request(app).post('/api/auth/login').send({ identifier: 'ghost@sec.test', password: PW })).body,
      (await request(app).post('/api/auth/login').send({ identifier: CUST_EMAIL, password: 'wrong' })).body,
      (await request(app).post('/api/auth/login').send({ identifier: ADMIN_EMAIL, password: PW })).body,
    ];
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it('a normal CUSTOMER still logs in fine (no collateral damage)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: CUST_EMAIL, password: PW });
    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.accessToken, { complete: true })?.header.alg).toBe('HS256');
  });
});

describe('login / register cannot be coerced into granting a role', () => {
  it('register ignores role / isActive / emailVerified in the body — the new account is an unverified CUSTOMER', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Sneaky',
      email: 'sneaky@sec.test',
      password: 'password123',
      address: {
        phone: '0791234567',
        addressLine: '1 Nowhere St',
        city: 'Amman',
      },
      role: 'ADMIN',
      isActive: false,
      emailVerified: '2000-01-01T00:00:00.000Z',
    });
    expect(res.status).toBe(201);
    const created = await prisma.user.findUnique({ where: { email: 'sneaky@sec.test' } });
    expect(created?.role).toBe('CUSTOMER');
    expect(created?.isActive).toBe(true);
    expect(created?.emailVerified).toBeNull(); // the body field did nothing — still unverified
  });

  it('extra body fields on login do nothing and __proto__ does not pollute', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send(
        `{"identifier":"${CUST_EMAIL}","password":"wrong","role":"ADMIN","__proto__":{"polluted":true}}`
      );
    expect(res.status).toBe(401);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('optionalAuth routes do not trust a bad token', () => {
  it('GET /api/cart with a forged ADMIN token behaves as a guest (200, fresh cart), not as that user', async () => {
    const forged = jwt.sign({ id: adminId, role: 'ADMIN' }, randomBytes(32).toString('hex'), {
      algorithm: 'HS256',
    });
    const res = await request(app).get('/api/cart').set(bearer(forged));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]); // a brand-new guest cart, not anyone's real one
  });
});

describe('refresh cannot be used to change role', () => {
  it("a customer's refresh cookie only ever mints a CUSTOMER access token", async () => {
    const login = await request(app).post('/api/auth/login').send({ identifier: CUST_EMAIL, password: PW });
    const cookie = login.headers['set-cookie'];
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refreshed.status).toBe(200);
    const claims = jwt.decode(refreshed.body.accessToken) as { role: string };
    expect(claims.role).toBe('CUSTOMER');
  });
});
