import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Order, OrderItem } from '@prisma/client';

vi.mock('../../src/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config/env')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      OWNER_NOTIFICATION_EMAIL: 'owner@test.dev',
      VAPID_PUBLIC_KEY: 'test-public-key',
      VAPID_PRIVATE_KEY: 'test-private-key',
      VAPID_SUBJECT: 'mailto:test@test.dev',
    },
  };
});

vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return { ...actual, sendOwnerOrderAlertEmail: vi.fn().mockResolvedValue(true) };
});

vi.mock('web-push', () => ({
  default: { sendNotification: vi.fn().mockResolvedValue({ statusCode: 201, body: '', headers: {} }) },
}));

import webpush from 'web-push';
import { sendOwnerOrderAlertEmail } from '../../src/lib/mailer';
import { sendOwnerNotification } from '../../src/lib/notifications/notification.service';
import { prisma } from '../../src/config/prisma';
import { createAdmin } from '../helpers/auth';

const mockEmail = vi.mocked(sendOwnerOrderAlertEmail);
const mockPush = vi.mocked(webpush.sendNotification);

const order = {
  id: 'o1',
  orderNumber: 'AS-001',
  guestEmail: 'jane@test.dev',
  deliveryName: 'Jane Doe',
  total: '43.00',
  items: [] as OrderItem[],
} as unknown as Order & { items: OrderItem[] };

beforeEach(() => {
  mockEmail.mockClear();
  mockPush.mockClear();
});

describe('sendOwnerNotification', () => {
  it('emails the owner AND pushes to every opted-in admin, in parallel', async () => {
    const { user: admin } = await createAdmin();
    await prisma.pushSubscription.create({
      data: { userID: admin.id, endpoint: 'https://push.example/a', p256dh: 'p', auth: 'a' },
    });

    const result = await sendOwnerNotification(order);

    expect(result).toEqual({ email: true, push: true });
    expect(mockEmail).toHaveBeenCalledWith('owner@test.dev', order);
    expect(mockPush).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockPush.mock.calls[0][1] as string);
    expect(payload).toMatchObject({ title: 'New order AS-001' });
    expect(payload.body).toContain('43.00');
  });

  it('still emails the owner when no admin has an active push subscription', async () => {
    const result = await sendOwnerNotification(order);
    expect(result).toEqual({ email: true, push: true }); // push "succeeds" trivially — nothing to send to
    expect(mockPush).not.toHaveBeenCalled();
  });
});
