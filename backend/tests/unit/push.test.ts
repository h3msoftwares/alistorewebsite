import { describe, it, expect, vi, beforeEach } from 'vitest';

// VAPID keys default to empty in the test env (see vitest config) — override
// them here so `configured` (computed at module load in lib/push.ts) is
// true for this file. Everything else about env stays real.
vi.mock('../../src/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/env')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      VAPID_PUBLIC_KEY: 'test-public-key',
      VAPID_PRIVATE_KEY: 'test-private-key',
      VAPID_SUBJECT: 'mailto:test@test.dev',
    },
  };
});

// The one real I/O boundary (an actual push service call) — mocked so the
// suite stays offline/deterministic, same reasoning as mocking the mailer
// elsewhere. There's no equivalent of hCaptcha's public test infrastructure
// for Web Push (every endpoint is a real, unique, browser-issued URL), so
// unlike the OTP suite this one can't exercise a real network call.
vi.mock('web-push', () => ({
  default: { sendNotification: vi.fn() },
  sendNotification: vi.fn(),
}));

import webpush from 'web-push';
import { prisma } from '../../src/config/prisma';
import { createUser, createStaffWith } from '../helpers/auth';
import { sendPushToAllAdmins } from '../../src/lib/push';

const mockSend = vi.mocked(webpush.sendNotification);

async function makeSubscription(userId: string, endpoint = `https://push.example/${Math.random()}`) {
  return prisma.pushSubscription.create({
    data: { userID: userId, endpoint, p256dh: 'p256dh-key', auth: 'auth-key' },
  });
}

beforeEach(() => {
  mockSend.mockReset();
});

describe('sendPushToAllAdmins', () => {
  it('sends to every STAFF/ADMIN subscription', async () => {
    mockSend.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const { user: admin } = await createUser({ role: 'ADMIN' });
    const { user: staff } = await createUser({ role: 'STAFF' });
    await makeSubscription(admin.id);
    await makeSubscription(staff.id);

    await sendPushToAllAdmins({ title: 'New order', body: 'AS-001 — $40.00' });

    expect(mockSend).toHaveBeenCalledTimes(2);
    const payloads = mockSend.mock.calls.map((c) => JSON.parse(c[1] as string));
    expect(payloads).toContainEqual({ title: 'New order', body: 'AS-001 — $40.00' });
  });

  it('never pushes to a CUSTOMER subscription, even if one exists', async () => {
    // Simulates a since-demoted admin: the row can only ever be created via
    // the admin-gated endpoint, but the role check here is re-evaluated at
    // send time, not trusted from subscribe time.
    mockSend.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const { user: customer } = await createUser({ role: 'CUSTOMER' });
    await makeSubscription(customer.id);

    await sendPushToAllAdmins({ title: 'New order', body: 'x' });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('deletes the subscription on a 410 Gone response from the push service', async () => {
    const { user: admin } = await createUser({ role: 'ADMIN' });
    const sub = await makeSubscription(admin.id);
    mockSend.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));

    await sendPushToAllAdmins({ title: 'New order', body: 'x' });

    expect(await prisma.pushSubscription.findUnique({ where: { id: sub.id } })).toBeNull();
  });

  it('deletes the subscription on a 404 Not Found response from the push service', async () => {
    const { user: admin } = await createUser({ role: 'ADMIN' });
    const sub = await makeSubscription(admin.id);
    mockSend.mockRejectedValue(Object.assign(new Error('not found'), { statusCode: 404 }));

    await sendPushToAllAdmins({ title: 'New order', body: 'x' });

    expect(await prisma.pushSubscription.findUnique({ where: { id: sub.id } })).toBeNull();
  });

  it('keeps the subscription on a non-404/410 failure (transient error)', async () => {
    const { user: admin } = await createUser({ role: 'ADMIN' });
    const sub = await makeSubscription(admin.id);
    mockSend.mockRejectedValue(Object.assign(new Error('server error'), { statusCode: 500 }));

    await sendPushToAllAdmins({ title: 'New order', body: 'x' });

    expect(await prisma.pushSubscription.findUnique({ where: { id: sub.id } })).not.toBeNull();
  });

  it('never throws even when every send fails', async () => {
    const { user: admin } = await createUser({ role: 'ADMIN' });
    await makeSubscription(admin.id);
    mockSend.mockRejectedValue(new Error('network down'));

    await expect(sendPushToAllAdmins({ title: 'x', body: 'y' })).resolves.toBeUndefined();
  });

  describe('requiredPermission filter', () => {
    it('only pushes to subscribers who actually hold the permission', async () => {
      mockSend.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
      const { user: admin } = await createUser({ role: 'ADMIN' }); // implicitly holds everything
      const withView = await createStaffWith(['orders:view']);
      const withoutView = await createStaffWith(['products:manage']);
      await makeSubscription(admin.id);
      await makeSubscription(withView.user.id);
      await makeSubscription(withoutView.user.id);

      await sendPushToAllAdmins({ title: 'New order', body: 'x' }, 'orders:view');

      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('with no requiredPermission, pushes to every STAFF/ADMIN regardless of their permissions', async () => {
      mockSend.mockResolvedValue({ statusCode: 201, body: '', headers: {} });
      const noPerms = await createStaffWith([]);
      await makeSubscription(noPerms.user.id);

      await sendPushToAllAdmins({ title: 'New order', body: 'x' });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
