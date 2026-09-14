import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createStaff, createCustomer, bearer, signAccessToken } from '../helpers/auth';
import { decryptSecret } from '../../src/lib/secret-encryption';
import { getEffectiveSmtpConfig } from '../../src/modules/settings/smtp-credential.service';

// verify() is the real-handshake check setCredential runs before persisting
// anything — mocked here so tests never open a real SMTP socket. sendMail
// isn't exercised by this module directly, but is mocked for completeness
// since mailer.ts's getTransporter() builds a transport the same way.
const verifyMock = vi.fn();
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      verify: verifyMock,
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test' }),
    }),
  },
}));

const app = buildApp();
const PATCH_URL = '/api/admin/smtp';
const STATUS_URL = '/api/admin/smtp/status';

beforeEach(() => {
  verifyMock.mockReset();
  verifyMock.mockResolvedValue(true);
});

describe('smtp credential — role gate', () => {
  it('GET /status: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).get(STATUS_URL)).status).toBe(401);
    const { token: customerToken } = await createCustomer();
    expect((await request(app).get(STATUS_URL).set(bearer(customerToken))).status).toBe(403);
    const { token: staffToken } = await createStaff();
    expect((await request(app).get(STATUS_URL).set(bearer(staffToken))).status).toBe(403);
  });

  it('PATCH /: 401 anon, 403 customer, 403 staff', async () => {
    const body = { email: 'store@example.com', appPassword: 'abcdabcdabcdabcd' };
    expect((await request(app).patch(PATCH_URL).send(body)).status).toBe(401);
    const { token: customerToken } = await createCustomer();
    expect((await request(app).patch(PATCH_URL).set(bearer(customerToken)).send(body)).status).toBe(403);
    const { token: staffToken } = await createStaff();
    expect((await request(app).patch(PATCH_URL).set(bearer(staffToken)).send(body)).status).toBe(403);
  });

  it('DELETE /: 401 anon, 403 customer, 403 staff', async () => {
    expect((await request(app).delete(PATCH_URL)).status).toBe(401);
    const { token: customerToken } = await createCustomer();
    expect((await request(app).delete(PATCH_URL).set(bearer(customerToken))).status).toBe(403);
    const { token: staffToken } = await createStaff();
    expect((await request(app).delete(PATCH_URL).set(bearer(staffToken))).status).toBe(403);
  });
});

describe('smtp credential — set / status / clear', () => {
  it('reports unconfigured when nothing is set (test env has no SMTP_* vars)', async () => {
    const { token } = await createAdmin();
    const res = await request(app).get(STATUS_URL).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toEqual({ configured: false, source: 'none', user: null, updatedAt: null });
  });

  it('sets a credential after a successful handshake, and never returns the password', async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .patch(PATCH_URL)
      .set(bearer(token))
      .send({ email: 'store@example.com', appPassword: 'abcdabcdabcdabcd' });

    expect(res.status).toBe(200);
    expect(res.body.status).toMatchObject({ configured: true, source: 'database', user: 'store@example.com' });
    expect(JSON.stringify(res.body)).not.toContain('abcdabcdabcdabcd');
    expect(verifyMock).toHaveBeenCalledTimes(1);

    const status = await request(app).get(STATUS_URL).set(bearer(token));
    expect(status.body.status).toMatchObject({ configured: true, source: 'database', user: 'store@example.com' });
  });

  it('encrypts the app password at rest — the raw value is never in the DB row', async () => {
    const { token } = await createAdmin();
    await request(app)
      .patch(PATCH_URL)
      .set(bearer(token))
      .send({ email: 'store@example.com', appPassword: 'super-secret-app-password' });

    const row = await prisma.smtpCredential.findUnique({ where: { id: 1 } });
    expect(row?.encryptedPassword).toBeTruthy();
    expect(row!.encryptedPassword).not.toContain('super-secret-app-password');
    expect(decryptSecret(row!.encryptedPassword!, 'smtp-credential-app-password-v1')).toBe(
      'super-secret-app-password'
    );
  });

  it('rejects (400) and persists nothing when the SMTP handshake fails', async () => {
    verifyMock.mockRejectedValue(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'));
    const { token } = await createAdmin();

    const res = await request(app)
      .patch(PATCH_URL)
      .set(bearer(token))
      .send({ email: 'store@example.com', appPassword: 'wrong-password-here' });

    expect(res.status).toBe(400);
    expect(await prisma.smtpCredential.findUnique({ where: { id: 1 } })).toBeNull();
  });

  it('a stale (non-fresh) token is refused with STEP_UP_REQUIRED on PATCH', async () => {
    const { user } = await createAdmin();
    const staleToken = signAccessToken(user.id, 'ADMIN', Math.floor(Date.now() / 1000) - 3600);

    const res = await request(app)
      .patch(PATCH_URL)
      .set(bearer(staleToken))
      .send({ email: 'store@example.com', appPassword: 'abcdabcdabcdabcd' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STEP_UP_REQUIRED');
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('DELETE clears the row and reverts status to unconfigured', async () => {
    const { token } = await createAdmin();
    await request(app)
      .patch(PATCH_URL)
      .set(bearer(token))
      .send({ email: 'store@example.com', appPassword: 'abcdabcdabcdabcd' });

    const res = await request(app).delete(PATCH_URL).set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toEqual({ configured: false, source: 'none', user: null, updatedAt: null });
  });

  it('every set/clear attempt is audit-logged, and the password is never in the metadata', async () => {
    const { token, user } = await createAdmin();
    await request(app)
      .patch(PATCH_URL)
      .set(bearer(token))
      .send({ email: 'store@example.com', appPassword: 'abcdabcdabcdabcd' });
    await request(app).delete(PATCH_URL).set(bearer(token));

    const rows = await prisma.auditLog.findMany({ where: { entityType: 'SmtpCredential', actorID: user.id } });
    const actions = rows.map((r) => r.action).sort();
    expect(actions).toEqual(['smtp_credential.clear', 'smtp_credential.set']);
    expect(JSON.stringify(rows)).not.toContain('abcdabcdabcdabcd');
  });
});

describe('smtp credential — DB row takes priority over env fallback', () => {
  it('getEffectiveSmtpConfig prefers the DB row once one exists', async () => {
    const before = await getEffectiveSmtpConfig();
    expect(before).toBeNull(); // test env has no SMTP_* vars set

    const { token } = await createAdmin();
    await request(app)
      .patch(PATCH_URL)
      .set(bearer(token))
      .send({ email: 'store@example.com', appPassword: 'abcdabcdabcdabcd' });

    const after = await getEffectiveSmtpConfig();
    expect(after).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      user: 'store@example.com',
      password: 'abcdabcdabcdabcd',
    });
  });
});

describe('smtp credential — rate limit cannot be spoofed away', () => {
  it('rotating X-Forwarded-For does not bypass PATCH / (5/15min)', async () => {
    const { token } = await createAdmin();
    const throttled = buildApp({ smtpCredentialRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(throttled)
        .patch(PATCH_URL)
        .set(bearer(token))
        .set('X-Forwarded-For', `10.30.40.${i}`)
        .send({ email: 'store@example.com', appPassword: 'abcdabcdabcdabcd' });
      statuses.push(r.status);
    }
    expect(statuses[5]).toBe(429);
  });
});
