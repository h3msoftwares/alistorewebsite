import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser } from '../helpers/auth';
import { FORGOT_PASSWORD_MESSAGE } from '../../src/modules/auth/password-reset.controller';

// The mailer is the one real I/O boundary (SMTP) — mock it so the suite stays
// offline/deterministic, same reasoning as mocking `fetch` on the frontend.
// Everything else (DB writes, token hashing, rate limiting) runs for real.
vi.mock('../../src/lib/mailer', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));
import { sendPasswordResetEmail } from '../../src/lib/mailer';
const mockSend = vi.mocked(sendPasswordResetEmail);

const app = buildApp(); // rate limiters off by default under test

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

const forgotPassword = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/forgot-password').send(body);

const resetPassword = (body: Record<string, unknown>) =>
  request(app).post('/api/auth/reset-password').send(body);

/** Pulls the raw reset token out of the URL the (mocked) mailer was called
 *  with — the only place the raw token is ever observable. */
function tokenFromCall(call: unknown[] | undefined): string {
  const url = call?.[1] as string;
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error('no token in mailer call');
  return token;
}

const GENERIC_RESET_ERROR = { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired reset link' } };

beforeEach(() => {
  mockSend.mockClear();
});

describe('POST /api/auth/forgot-password', () => {
  it('existing email -> 200 generic message; creates a hashed, unused, unexpired token row', async () => {
    const { user } = await createUser({ role: 'CUSTOMER', email: 'exists@sec.test', password: 'Whatever123!' });

    const res = await forgotPassword({ email: 'exists@sec.test' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: FORGOT_PASSWORD_MESSAGE });

    const rows = await prisma.passwordResetToken.findMany({ where: { userID: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex, never the raw token
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [to, url] = mockSend.mock.calls[0];
    expect(to).toBe('exists@sec.test');
    expect(url).toContain('/en/reset-password?token=');
  });

  it('non-existent email -> 200, the SAME message, no DB row, no email sent', async () => {
    const res = await forgotPassword({ email: 'nobody-here@sec.test' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    expect(await prisma.passwordResetToken.count()).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('an inactive account and an OAuth-only (no-password) account are treated as non-existent', async () => {
    await createUser({ role: 'CUSTOMER', email: 'inactive@sec.test', password: 'Whatever123!' });
    await prisma.user.update({ where: { email: 'inactive@sec.test' }, data: { isActive: false } });
    await prisma.user.create({
      data: { name: 'OAuth Only', email: 'oauth-only@sec.test', role: 'CUSTOMER', passwordHash: null },
    });

    for (const email of ['inactive@sec.test', 'oauth-only@sec.test']) {
      const res = await forgotPassword({ email });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: FORGOT_PASSWORD_MESSAGE });
    }
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it('400s a malformed email — pure input validation, not an enumeration risk', async () => {
    const res = await forgotPassword({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('response time for an existing vs a non-existent email is comparably close', async () => {
    await createUser({ role: 'CUSTOMER', email: 'timing.real@sec.test', password: 'Whatever123!' });

    const timeOnce = async (body: Record<string, unknown>) => {
      const t0 = performance.now();
      await forgotPassword(body);
      return performance.now() - t0;
    };

    const N = 5;
    let real = 0;
    let fake = 0;
    for (let i = 0; i < N; i++) {
      real += await timeOnce({ email: 'timing.real@sec.test' });
      fake += await timeOnce({ email: `timing.fake${i}@sec.test` });
    }
    real /= N;
    fake /= N;

    // Both pay the unconditional Argon2 hash (tens of ms) — a "no such user,
    // bail immediately" fast path would show up as a large gap here.
    expect(real).toBeGreaterThan(8);
    expect(fake).toBeGreaterThan(8);
    expect(real).toBeLessThan(fake * 4);
    expect(fake).toBeLessThan(real * 4);
  });

  it('requesting a reset twice invalidates the first token', async () => {
    await createUser({ role: 'CUSTOMER', email: 'twice@sec.test', password: 'Whatever123!' });

    await forgotPassword({ email: 'twice@sec.test' });
    const token1 = tokenFromCall(mockSend.mock.calls[0]);

    await forgotPassword({ email: 'twice@sec.test' });
    const token2 = tokenFromCall(mockSend.mock.calls[1]);

    expect(token1).not.toBe(token2);

    // old tokens don't linger — only the newest row exists
    const rows = await prisma.passwordResetToken.findMany({
      where: { user: { email: 'twice@sec.test' } },
    });
    expect(rows).toHaveLength(1);

    const oldAttempt = await resetPassword({ token: token1, newPassword: 'Newer12345!' });
    expect(oldAttempt.status).toBe(401);
    expect(oldAttempt.body).toEqual(GENERIC_RESET_ERROR);

    const newAttempt = await resetPassword({ token: token2, newPassword: 'Newer12345!' });
    expect(newAttempt.status).toBe(200);
  });

  describe('rate limiting', () => {
    it('per IP: an 11th request (varying emails) in the window is 429', async () => {
      const throttled = buildApp({ forgotPasswordRateLimit: true });
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const r = await request(throttled)
          .post('/api/auth/forgot-password')
          .send({ email: `ip-flood${i}@sec.test` }); // different email each time
        statuses.push(r.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    });

    it('per email: a 4th request for the same address in the window is 429, even across "IPs"', async () => {
      const throttled = buildApp({ forgotPasswordRateLimit: true });
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await request(throttled)
          .post('/api/auth/forgot-password')
          .set('X-Forwarded-For', `10.0.0.${i}`) // trust proxy is off outside prod — ignored
          .send({ email: 'one-victim@sec.test' });
        statuses.push(r.status);
      }
      expect(statuses.slice(0, 3).every((s) => s === 200)).toBe(true);
      expect(statuses[3]).toBe(429);
    });
  });
});

describe('POST /api/auth/reset-password', () => {
  it('valid unexpired unused token: 200, password actually changes, all prior refresh tokens revoked', async () => {
    await createUser({ role: 'CUSTOMER', email: 'reset.me@sec.test', password: 'OldPassword1!' });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'reset.me@sec.test', password: 'OldPassword1!' });
    expect(login.status).toBe(200);
    const oldSessionCookie = login.headers['set-cookie'];

    await forgotPassword({ email: 'reset.me@sec.test' });
    const token = tokenFromCall(mockSend.mock.calls.at(-1));

    const reset = await resetPassword({ token, newPassword: 'NewPassword1!' });
    expect(reset.status).toBe(200);

    // old password rejected, new password works
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'reset.me@sec.test', password: 'OldPassword1!' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'reset.me@sec.test', password: 'NewPassword1!' });
    expect(newLogin.status).toBe(200);

    // the session that existed before the reset is dead
    const oldRefresh = await request(app).post('/api/auth/refresh').set('Cookie', oldSessionCookie);
    expect(oldRefresh.status).toBe(401);

    // only the brand-new session (from newLogin) is active
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('rejects an expired token (generic message)', async () => {
    const { user } = await createUser({ role: 'CUSTOMER', email: 'expired@sec.test', password: 'Whatever123!' });
    const raw = 'raw-expired-token-0123456789abcdef';
    await prisma.passwordResetToken.create({
      data: { userID: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await resetPassword({ token: raw, newPassword: 'Newer12345!' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_RESET_ERROR);
  });

  it('rejects an already-used token (generic message)', async () => {
    const { user } = await createUser({ role: 'CUSTOMER', email: 'used@sec.test', password: 'Whatever123!' });
    const raw = 'raw-used-token-0123456789abcdefgh';
    await prisma.passwordResetToken.create({
      data: {
        userID: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
        usedAt: new Date(),
      },
    });

    const res = await resetPassword({ token: raw, newPassword: 'Newer12345!' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_RESET_ERROR);
  });

  it('rejects an unknown/garbage token — identical response to expired/used', async () => {
    const res = await resetPassword({ token: 'totally-made-up-token', newPassword: 'Newer12345!' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_RESET_ERROR);
  });

  it('rejects a new password weaker than the registration rule (min 8 chars)', async () => {
    const { user } = await createUser({ role: 'CUSTOMER', email: 'weak@sec.test', password: 'Whatever123!' });
    const raw = 'raw-weak-pw-token-0123456789abcd';
    await prisma.passwordResetToken.create({
      data: { userID: user.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await resetPassword({ token: raw, newPassword: 'short' });
    expect(res.status).toBe(400);

    // the token is untouched by the failed attempt — still usable
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(raw) } });
    expect(row?.usedAt).toBeNull();
  });

  it('rate-limits rapid attempts per IP (an 11th request is 429)', async () => {
    const throttled = buildApp({ resetPasswordRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await request(throttled)
        .post('/api/auth/reset-password')
        .send({ token: `guess-${i}`, newPassword: 'Whatever123!' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('works identically for a STAFF/ADMIN account as for a CUSTOMER — no role branching', async () => {
    await createUser({ role: 'ADMIN', email: 'admin.pw@sec.test', password: 'OldAdminPass1!' });

    const forgot = await forgotPassword({ email: 'admin.pw@sec.test' });
    expect(forgot.status).toBe(200);
    expect(forgot.body).toEqual({ message: FORGOT_PASSWORD_MESSAGE });

    const token = tokenFromCall(mockSend.mock.calls.at(-1));
    const reset = await resetPassword({ token, newPassword: 'NewAdminPass1!' });
    expect(reset.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'admin.pw@sec.test', password: 'NewAdminPass1!' });
    expect(login.status).toBe(200);

    const adminLogin = await request(app)
      .post('/api/auth/admin-login')
      .send({ identifier: 'admin.pw@sec.test', password: 'NewAdminPass1!' });
    expect(adminLogin.status).toBe(200);
  });
});
