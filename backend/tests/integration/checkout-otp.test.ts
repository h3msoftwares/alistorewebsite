import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser, bearer } from '../helpers/auth';

// The mailer is the one real I/O boundary (SMTP) — mock it so the suite stays
// offline/deterministic for the email itself, same reasoning as the
// password-reset suite. The CAPTCHA check is deliberately left real: it's a
// live call to hCaptcha's public siteverify API using hCaptcha's own
// documented test secret (the app's default under test), so CI doesn't need
// a registered site to exercise this gate.
vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return { ...actual, sendCheckoutOtpEmail: vi.fn().mockResolvedValue(true) };
});
import { sendCheckoutOtpEmail } from '../../src/lib/mailer';
const mockSendOtp = vi.mocked(sendCheckoutOtpEmail);

const app = buildApp();

// hCaptcha's own documented test secret (the app's default HCAPTCHA_SECRET
// under test) only accepts this exact dummy passcode as "success: true" —
// any other token genuinely fails a real siteverify call.
const HCAPTCHA_DUMMY_TOKEN = '10000000-aaaa-bbbb-cccc-000000000001';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');

const requestOtp = (email: string, captchaToken: string = HCAPTCHA_DUMMY_TOKEN) =>
  request(app).post('/api/checkout/otp/request').send({ email, captchaToken });

const verifyOtp = (email: string, code: string) =>
  request(app).post('/api/checkout/otp/verify').send({ email, code });

function lastSentCode(): string {
  return mockSendOtp.mock.calls.at(-1)?.[1] as string;
}

beforeEach(() => {
  mockSendOtp.mockClear();
});

describe('POST /api/checkout/otp/request', () => {
  it('sends a 6-digit code and stores only its hash', async () => {
    const res = await requestOtp('a@test.dev');
    expect(res.status).toBe(204);
    expect(mockSendOtp).toHaveBeenCalledTimes(1);

    const code = lastSentCode();
    expect(code).toMatch(/^\d{6}$/);

    const rows = await prisma.checkoutOtp.findMany({ where: { email: 'a@test.dev' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).toBe(hash(code));
    expect(rows[0].codeHash).not.toBe(code);
  });

  it('rejects an invalid captcha token via a real hCaptcha siteverify call, no email sent', async () => {
    const res = await requestOtp('b@test.dev', 'definitely-not-a-real-token');
    expect(res.status).toBe(400);
    expect(mockSendOtp).not.toHaveBeenCalled();
    expect(await prisma.checkoutOtp.count()).toBe(0);
  });

  it('400s a request missing captchaToken entirely (schema layer)', async () => {
    const res = await request(app).post('/api/checkout/otp/request').send({ email: 'c@test.dev' });
    expect(res.status).toBe(400);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('enforces a 60s cooldown between requests for the same email', async () => {
    expect((await requestOtp('cooldown@test.dev')).status).toBe(204);
    const second = await requestOtp('cooldown@test.dev');
    expect(second.status).toBe(429);
    expect(mockSendOtp).toHaveBeenCalledTimes(1); // the cooldown hit sent nothing
  });

  it('caps requests per email at 3 within the 15-minute window', async () => {
    // Backdate past the 60s cooldown but still inside the 15-minute window.
    for (let i = 0; i < 3; i++) {
      await prisma.checkoutOtp.create({
        data: {
          email: 'window@test.dev',
          codeHash: hash('000000'),
          codeExpiresAt: new Date(Date.now() + 5 * 60_000),
          createdAt: new Date(Date.now() - 61_000 - i * 1_000),
        },
      });
    }
    const res = await requestOtp('window@test.dev');
    expect(res.status).toBe(429);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it('caps requests per IP at 10 within the 15-minute window, across different emails', async () => {
    // Learn what req.ip resolves to in this environment from one real request.
    expect((await requestOtp('ip-probe@test.dev')).status).toBe(204);
    const probe = await prisma.checkoutOtp.findFirst({ where: { email: 'ip-probe@test.dev' } });
    const ip = probe!.requestIP!;

    // 9 more for the same IP, different emails so the per-email cap doesn't
    // interfere — 1 (probe) + 9 = 10, at the cap.
    for (let i = 0; i < 9; i++) {
      await prisma.checkoutOtp.create({
        data: {
          email: `ip-${i}@test.dev`,
          codeHash: hash('000000'),
          codeExpiresAt: new Date(Date.now() + 5 * 60_000),
          requestIP: ip,
          createdAt: new Date(Date.now() - 61_000),
        },
      });
    }

    mockSendOtp.mockClear();
    const res = await requestOtp('ip-final@test.dev');
    expect(res.status).toBe(429);
    expect(mockSendOtp).not.toHaveBeenCalled();
  });
});

describe('POST /api/checkout/otp/verify', () => {
  it('verifies a correct code and returns a verifyToken', async () => {
    await requestOtp('verify1@test.dev');
    const code = lastSentCode();

    const res = await verifyOtp('verify1@test.dev', code);
    expect(res.status).toBe(200);
    expect(typeof res.body.verifyToken).toBe('string');

    const row = await prisma.checkoutOtp.findFirst({ where: { email: 'verify1@test.dev' } });
    expect(row?.verifiedAt).not.toBeNull();
    expect(row?.verifyTokenHash).toBe(hash(res.body.verifyToken));
  });

  it('rejects a wrong code and increments attempts', async () => {
    await requestOtp('verify2@test.dev');
    const res = await verifyOtp('verify2@test.dev', '000000'); // never a real code (always >= 100000)
    expect(res.status).toBe(401);

    const row = await prisma.checkoutOtp.findFirst({ where: { email: 'verify2@test.dev' } });
    expect(row?.attempts).toBe(1);
  });

  it('caps wrong attempts at 5, after which even the correct code is dead', async () => {
    await requestOtp('verify3@test.dev');
    const code = lastSentCode();

    for (let i = 0; i < 5; i++) {
      expect((await verifyOtp('verify3@test.dev', '000000')).status).toBe(401);
    }
    const row = await prisma.checkoutOtp.findFirst({ where: { email: 'verify3@test.dev' } });
    expect(row?.attempts).toBe(5);

    const res = await verifyOtp('verify3@test.dev', code);
    expect(res.status).toBe(401);
  });

  it('rejects an expired code', async () => {
    await prisma.checkoutOtp.create({
      data: {
        email: 'expired@test.dev',
        codeHash: hash('123456'),
        codeExpiresAt: new Date(Date.now() - 1_000),
      },
    });
    const res = await verifyOtp('expired@test.dev', '123456');
    expect(res.status).toBe(401);
  });

  it('stamps User.emailVerified for a logged-in unverified user who verifies their account email', async () => {
    const { user, token } = await createUser({ emailVerified: false, email: 'unverified-otp@test.dev' });
    await requestOtp(user.email!);
    const code = lastSentCode();

    const res = await request(app)
      .post('/api/checkout/otp/verify')
      .set(bearer(token))
      .send({ email: user.email, code });
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.emailVerified).not.toBeNull();
  });
});
