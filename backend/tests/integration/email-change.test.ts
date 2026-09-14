import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser, bearer } from '../helpers/auth';

// SMTP is the one real I/O boundary — mock it so the suite stays offline and
// deterministic. Everything else runs for real.
vi.mock('../../src/lib/mailer', () => ({
  sendEmailChangeConfirmationEmail: vi.fn().mockResolvedValue(true),
  sendEmailChangeRequestedNoticeEmail: vi.fn().mockResolvedValue(true),
  sendEmailChangedNoticeEmail: vi.fn().mockResolvedValue(true),
}));
import {
  sendEmailChangeConfirmationEmail,
  sendEmailChangeRequestedNoticeEmail,
  sendEmailChangedNoticeEmail,
} from '../../src/lib/mailer';
const mockConfirm = vi.mocked(sendEmailChangeConfirmationEmail);
const mockRequestNotice = vi.mocked(sendEmailChangeRequestedNoticeEmail);
const mockChangedNotice = vi.mocked(sendEmailChangedNoticeEmail);

const app = buildApp(); // rate limiters off by default under test
const REQUEST_URL = '/api/account/email-change/request';
const CONFIRM_URL = '/api/account/email-change/confirm';

const OLD_PASSWORD = 'CurrentPassw0rd!';

// This flow is ADMIN-only (see email-change.routes.ts's requireRole('ADMIN')) —
// not a general customer/STAFF feature.
async function makeUser(email = 'owner@old.test') {
  return createUser({ role: 'ADMIN', email, password: OLD_PASSWORD, emailVerified: true });
}

/** The raw token is only ever observable in the URL handed to the mailer. */
function tokenFromLastConfirmCall(): string {
  const url = mockConfirm.mock.calls.at(-1)?.[1] as string;
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error('no token in mailer call');
  return token;
}

beforeEach(() => {
  mockConfirm.mockClear();
  mockRequestNotice.mockClear();
  mockChangedNotice.mockClear();
});

describe('POST /api/account/email-change/request', () => {
  it('requires authentication', async () => {
    const res = await request(app)
      .post(REQUEST_URL)
      .send({ newEmail: 'new@test.dev', currentPassword: OLD_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('is ADMIN-only: 403 for a customer, 403 for STAFF', async () => {
    const customer = await createUser({ role: 'CUSTOMER', password: OLD_PASSWORD, emailVerified: true });
    const staff = await createUser({ role: 'STAFF', password: OLD_PASSWORD, emailVerified: true });

    const asCustomer = await request(app)
      .post(REQUEST_URL)
      .set(bearer(customer.token))
      .send({ newEmail: 'new@test.dev', currentPassword: OLD_PASSWORD });
    expect(asCustomer.status).toBe(403);

    const asStaff = await request(app)
      .post(REQUEST_URL)
      .set(bearer(staff.token))
      .send({ newEmail: 'new@test.dev', currentPassword: OLD_PASSWORD });
    expect(asStaff.status).toBe(403);
  });

  it('rejects a wrong current password with 400 and creates no request row', async () => {
    const { user, token } = await makeUser();
    const res = await request(app)
      .post(REQUEST_URL)
      .set(bearer(token))
      .send({ newEmail: 'new@test.dev', currentPassword: 'not-it' });

    expect(res.status).toBe(400);
    expect(await prisma.emailChangeRequest.count({ where: { userID: user.id } })).toBe(0);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('rejects a new email equal to the current one (400)', async () => {
    const { token } = await makeUser('same@test.dev');
    const res = await request(app)
      .post(REQUEST_URL)
      .set(bearer(token))
      .send({ newEmail: 'same@test.dev', currentPassword: OLD_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('sends a confirmation link to the new address and a notice to the old one', async () => {
    const { user, token } = await makeUser('owner@old.test');
    const res = await request(app)
      .post(REQUEST_URL)
      .set(bearer(token))
      .send({ newEmail: 'owner@new.test', currentPassword: OLD_PASSWORD });

    expect(res.status).toBe(200);
    expect(mockConfirm).toHaveBeenCalledWith('owner@new.test', expect.stringContaining('/confirm-email-change?token='), expect.any(Number));
    expect(mockRequestNotice).toHaveBeenCalledWith('owner@old.test', 'owner@new.test');

    const row = await prisma.emailChangeRequest.findFirstOrThrow({ where: { userID: user.id } });
    expect(row.newEmail).toBe('owner@new.test');
    expect(row.usedAt).toBeNull();
  });

  it('replaces any outstanding request when asked again for a different address', async () => {
    const { user, token } = await makeUser();
    await request(app)
      .post(REQUEST_URL)
      .set(bearer(token))
      .send({ newEmail: 'first@new.test', currentPassword: OLD_PASSWORD });
    await request(app)
      .post(REQUEST_URL)
      .set(bearer(token))
      .send({ newEmail: 'second@new.test', currentPassword: OLD_PASSWORD });

    const rows = await prisma.emailChangeRequest.findMany({ where: { userID: user.id, usedAt: null } });
    expect(rows).toHaveLength(1);
    expect(rows[0].newEmail).toBe('second@new.test');
  });

  it('enumeration-resistant: an email already taken by another account gets the same 200 response but no confirmation email, only the old-address notice', async () => {
    await makeUser('taken@test.dev');
    const { user, token } = await makeUser('asker@test.dev');

    const res = await request(app)
      .post(REQUEST_URL)
      .set(bearer(token))
      .send({ newEmail: 'taken@test.dev', currentPassword: OLD_PASSWORD });

    expect(res.status).toBe(200);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRequestNotice).toHaveBeenCalledWith('asker@test.dev', 'taken@test.dev');
    expect(await prisma.emailChangeRequest.count({ where: { userID: user.id } })).toBe(0);
  });
});

describe('POST /api/account/email-change/confirm', () => {
  it('rejects a garbage token with 401', async () => {
    const res = await request(app).post(CONFIRM_URL).send({ token: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('valid token: changes the email, stamps emailVerified, revokes other sessions, notifies the old address', async () => {
    const { user } = await makeUser('owner@old.test');

    // a real login so there's a refresh token / session to revoke — ADMIN
    // accounts only sign in through the admin door, not /api/auth/login
    // (which explicitly refuses privileged accounts).
    const login = await request(app)
      .post('/api/auth/ali-admin-login')
      .send({ identifier: 'owner@old.test', password: OLD_PASSWORD });
    expect(login.status).toBe(200);
    const accessToken = login.body.accessToken as string;

    await request(app)
      .post(REQUEST_URL)
      .set(bearer(accessToken))
      .send({ newEmail: 'owner@new.test', currentPassword: OLD_PASSWORD });
    const token = tokenFromLastConfirmCall();

    const res = await request(app).post(CONFIRM_URL).send({ token });
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.email).toBe('owner@new.test');
    expect(updated.emailVerified).not.toBeNull();

    expect(mockChangedNotice).toHaveBeenCalledWith('owner@old.test', 'owner@new.test');

    // every pre-existing session is revoked
    const live = await prisma.refreshToken.count({ where: { userID: user.id, revokedAt: null } });
    expect(live).toBe(0);

    // sign-in now works with the new address, not the old one
    expect(
      (
        await request(app)
          .post('/api/auth/ali-admin-login')
          .send({ identifier: 'owner@new.test', password: OLD_PASSWORD })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .post('/api/auth/ali-admin-login')
          .send({ identifier: 'owner@old.test', password: OLD_PASSWORD })
      ).status
    ).toBe(401);
  });

  it('a token cannot be replayed a second time', async () => {
    const { token: userToken } = await makeUser();
    await request(app)
      .post(REQUEST_URL)
      .set(bearer(userToken))
      .send({ newEmail: 'once@new.test', currentPassword: OLD_PASSWORD });
    const token = tokenFromLastConfirmCall();

    const first = await request(app).post(CONFIRM_URL).send({ token });
    expect(first.status).toBe(200);

    const second = await request(app).post(CONFIRM_URL).send({ token });
    expect(second.status).toBe(401);
  });

  it('an expired token is rejected (401)', async () => {
    const { user, token: userToken } = await makeUser();
    await request(app)
      .post(REQUEST_URL)
      .set(bearer(userToken))
      .send({ newEmail: 'expired@new.test', currentPassword: OLD_PASSWORD });
    const token = tokenFromLastConfirmCall();

    await prisma.emailChangeRequest.updateMany({
      where: { userID: user.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await request(app).post(CONFIRM_URL).send({ token });
    expect(res.status).toBe(401);
  });

  it('a race where the address gets taken between request and confirm is rejected (409), and the token is burned', async () => {
    const { token: userToken } = await makeUser('racer@old.test');
    await request(app)
      .post(REQUEST_URL)
      .set(bearer(userToken))
      .send({ newEmail: 'raced@new.test', currentPassword: OLD_PASSWORD });
    const token = tokenFromLastConfirmCall();

    // someone else claims the address in the meantime
    await makeUser('raced@new.test');

    const res = await request(app).post(CONFIRM_URL).send({ token });
    expect(res.status).toBe(409);

    // token is burned regardless — cannot be retried
    const retry = await request(app).post(CONFIRM_URL).send({ token });
    expect(retry.status).toBe(401);
  });
});

describe('email change — rate limit cannot be spoofed away', () => {
  it('rotating X-Forwarded-For does not bypass POST /request (5/15min)', async () => {
    const { token } = await makeUser();
    const throttled = buildApp({ emailChangeRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(throttled)
        .post(REQUEST_URL)
        .set(bearer(token))
        .set('X-Forwarded-For', `10.40.50.${i}`)
        .send({ newEmail: `spam${i}@new.test`, currentPassword: OLD_PASSWORD });
      statuses.push(r.status);
    }
    expect(statuses[5]).toBe(429);
  });

  it('rotating X-Forwarded-For does not bypass POST /confirm (10/15min)', async () => {
    const throttled = buildApp({ emailChangeRateLimit: true });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await request(throttled)
        .post(CONFIRM_URL)
        .set('X-Forwarded-For', `10.40.60.${i}`)
        .send({ token: 'not-a-real-token' });
      statuses.push(r.status);
    }
    expect(statuses[10]).toBe(429);
  });
});
