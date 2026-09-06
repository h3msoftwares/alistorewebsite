import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser } from '../helpers/auth';
import { REGISTER_MESSAGE } from '../../src/modules/auth/auth.controller';
import { VERIFY_EMAIL_MESSAGE } from '../../src/modules/auth/email-verification.controller';

// SMTP is the one real I/O boundary — mock it so the suite stays offline and
// deterministic. Everything else runs for real.
vi.mock('../../src/lib/mailer', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));
import { sendVerificationEmail } from '../../src/lib/mailer';
const mockSend = vi.mocked(sendVerificationEmail);

const app = buildApp(); // rate limiters off by default under test

const registerBody = (over: Record<string, unknown> = {}) => ({
  email: 'newbie@verify.test',
  password: 'Password123!',
  name: 'Newbie',
  phone: '0791234567',
  address: { fullName: 'Newbie', phone: '0791234567', addressLine: '9 Elm St', city: 'Amman' },
  ...over,
});

/** The raw token is only ever observable in the URL handed to the mailer. */
function tokenFromLastCall(): string {
  const url = mockSend.mock.calls.at(-1)?.[1] as string;
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error('no token in mailer call');
  return token;
}

/** Register a fresh user and return their live verification token. */
async function registerAndGetToken(email = 'newbie@verify.test') {
  mockSend.mockClear();
  const res = await request(app).post('/api/auth/register').send(registerBody({ email }));
  expect(res.status).toBe(201);
  expect(mockSend).toHaveBeenCalledTimes(1);
  return tokenFromLastCall();
}

const GENERIC_VERIFY_ERROR = {
  error: { code: 'UNAUTHORIZED', message: 'Invalid or expired verification link' },
};

beforeEach(() => {
  mockSend.mockClear();
});

describe('POST /api/auth/verify-email', () => {
  it('happy path: a fresh token -> 200; user.emailVerified set, token marked used', async () => {
    const token = await registerAndGetToken();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'newbie@verify.test' } });
    expect(user.emailVerified).toBeNull();

    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: VERIFY_EMAIL_MESSAGE });
    // No session issued on verify.
    expect(res.body.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerified).not.toBeNull();
    const row = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userID: user.id } });
    expect(row.usedAt).not.toBeNull();
  });

  it('an already-used token -> 401, byte-identical to a garbage token', async () => {
    const token = await registerAndGetToken();
    await request(app).post('/api/auth/verify-email').send({ token }); // first use

    const reused = await request(app).post('/api/auth/verify-email').send({ token });
    const garbage = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' });

    expect(reused.status).toBe(401);
    expect(garbage.status).toBe(401);
    expect(reused.body).toEqual(GENERIC_VERIFY_ERROR);
    expect(garbage.body).toEqual(GENERIC_VERIFY_ERROR);
  });

  it('an expired token -> 401 (same generic body)', async () => {
    const token = await registerAndGetToken();
    await prisma.emailVerificationToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_VERIFY_ERROR);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'newbie@verify.test' } });
    expect(user.emailVerified).toBeNull(); // not verified by an expired token
  });

  it('400s a missing / over-long token (input validation, not an oracle)', async () => {
    expect((await request(app).post('/api/auth/verify-email').send({})).status).toBe(400);
    expect(
      (await request(app).post('/api/auth/verify-email').send({ token: 'x'.repeat(600) })).status
    ).toBe(400);
  });

  it('rate-limits per IP (11th -> 429)', async () => {
    const rlApp = buildApp({ verifyEmailRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await request(rlApp).post('/api/auth/verify-email').send({ token: `guess-${i}` })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('an unverified account -> 200 generic message; a FRESH token + email', async () => {
    await registerAndGetToken('resend@verify.test');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'resend@verify.test' } });
    const firstToken = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userID: user.id } });
    mockSend.mockClear();

    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'resend@verify.test' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: REGISTER_MESSAGE }); // same generic string as register
    expect(mockSend).toHaveBeenCalledTimes(1);

    const tokens = await prisma.emailVerificationToken.findMany({ where: { userID: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].id).not.toBe(firstToken.id); // old one invalidated
  });

  it('a VERIFIED account -> 200 SAME message; no token, no email', async () => {
    await createUser({ role: 'CUSTOMER', email: 'done@verify.test', password: 'Password123!', emailVerified: true });
    mockSend.mockClear();

    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'done@verify.test' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: REGISTER_MESSAGE });
    expect(mockSend).not.toHaveBeenCalled();
    expect(await prisma.emailVerificationToken.count()).toBe(0);
  });

  it('an unknown email -> 200 SAME message; nothing happens', async () => {
    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'ghost@verify.test' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: REGISTER_MESSAGE });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('an inactive / passwordless account is treated as non-existent', async () => {
    await createUser({ role: 'CUSTOMER', email: 'inactive@verify.test', password: 'Password123!', emailVerified: false });
    await prisma.user.update({ where: { email: 'inactive@verify.test' }, data: { isActive: false } });
    await prisma.user.create({
      data: { name: 'OAuth', email: 'oauth@verify.test', role: 'CUSTOMER', passwordHash: null },
    });
    mockSend.mockClear();

    for (const email of ['inactive@verify.test', 'oauth@verify.test']) {
      const res = await request(app).post('/api/auth/resend-verification').send({ email });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: REGISTER_MESSAGE });
    }
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('400s a malformed email', async () => {
    expect(
      (await request(app).post('/api/auth/resend-verification').send({ email: 'nope' })).status
    ).toBe(400);
  });

  it('rate-limits per IP (11th -> 429) and per submitted email (4th -> 429)', async () => {
    const rlApp = buildApp({ resendVerificationRateLimit: true });

    const perEmail: number[] = [];
    for (let i = 0; i < 4; i++) {
      perEmail.push(
        (await request(rlApp).post('/api/auth/resend-verification').send({ email: 'flood@verify.test' })).status
      );
    }
    expect(perEmail.slice(0, 3).every((s) => s === 200)).toBe(true);
    expect(perEmail[3]).toBe(429);

    const perIp: number[] = [];
    for (let i = 0; i < 8; i++) {
      perIp.push(
        (await request(rlApp).post('/api/auth/resend-verification').send({ email: `ip-${i}@verify.test` })).status
      );
    }
    expect(perIp).toContain(429);
  });
});
