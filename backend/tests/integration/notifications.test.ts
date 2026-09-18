import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createStaffWith, createCustomer, bearer } from '../helpers/auth';

const app = buildApp();

async function seedNotification(over: Partial<{ requiredPermission: string | null; type: string }> = {}) {
  return prisma.notification.create({
    data: {
      type: over.type ?? 'order.created',
      title: 'New order AS-001',
      body: '$40.00 (COD) — Jane Doe',
      requiredPermission: over.requiredPermission ?? null,
    },
  });
}

describe('GET /api/admin/notifications', () => {
  it('lists global notifications (requiredPermission: null) to any STAFF/ADMIN', async () => {
    await seedNotification();
    const { token } = await createStaffWith([]);
    const res = await request(app).get('/api/admin/notifications').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.unreadCount).toBe(1);
  });

  it('only shows a permission-gated notification to a caller who holds that permission', async () => {
    await seedNotification({ requiredPermission: 'orders:view' });
    const withPerm = await createStaffWith(['orders:view']);
    const withoutPerm = await createStaffWith(['products:manage']);

    const ok = await request(app).get('/api/admin/notifications').set(bearer(withPerm.token));
    expect(ok.body.notifications).toHaveLength(1);

    const hidden = await request(app).get('/api/admin/notifications').set(bearer(withoutPerm.token));
    expect(hidden.body.notifications).toHaveLength(0);
    expect(hidden.body.unreadCount).toBe(0);
  });

  it('unreadOnly=true filters out already-read notifications', async () => {
    const n1 = await seedNotification();
    await seedNotification();
    const { user, token } = await createAdmin();
    await request(app).post(`/api/admin/notifications/${n1.id}/read`).set(bearer(token));

    const res = await request(app).get('/api/admin/notifications?unreadOnly=true').set(bearer(token));
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].id).not.toBe(n1.id);
    void user;
  });

  it('unreadCount reflects every unread notification, not just the ones on the truncated feed page', async () => {
    // Seed more than the feed's own take-limit (50) so a badge that
    // mistakenly derived its count from the list response instead of its
    // own query would visibly undercount.
    await Promise.all(Array.from({ length: 55 }, () => seedNotification()));
    const { token } = await createAdmin();

    const res = await request(app).get('/api/admin/notifications').set(bearer(token));
    expect(res.body.notifications.length).toBeLessThanOrEqual(50);
    expect(res.body.unreadCount).toBe(55);
  });

  it('requires auth (401) and a STAFF/ADMIN role (403 for a customer)', async () => {
    expect((await request(app).get('/api/admin/notifications')).status).toBe(401);
    const { token } = await createCustomer();
    expect((await request(app).get('/api/admin/notifications').set(bearer(token))).status).toBe(403);
  });
});

describe('POST /api/admin/notifications/:id/read', () => {
  it('marks one notification read for the caller only', async () => {
    const n = await seedNotification();
    const a = await createAdmin();
    const b = await createAdmin();

    const res = await request(app).post(`/api/admin/notifications/${n.id}/read`).set(bearer(a.token));
    expect(res.status).toBe(204);

    const asA = await request(app).get('/api/admin/notifications').set(bearer(a.token));
    expect(asA.body.notifications[0].read).toBe(true);
    expect(asA.body.unreadCount).toBe(0);

    const asB = await request(app).get('/api/admin/notifications').set(bearer(b.token));
    expect(asB.body.notifications[0].read).toBe(false);
    expect(asB.body.unreadCount).toBe(1);
  });

  it('quietly no-ops for a notification the caller cannot see (does not 404/error, does not mark it read for anyone)', async () => {
    const n = await seedNotification({ requiredPermission: 'orders:view' });
    const noPerm = await createStaffWith([]);

    const res = await request(app).post(`/api/admin/notifications/${n.id}/read`).set(bearer(noPerm.token));
    expect(res.status).toBe(204);
    expect(await prisma.notificationRead.count()).toBe(0);
  });

  it('quietly no-ops for a nonexistent id', async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post('/api/admin/notifications/00000000-0000-4000-8000-000000000000/read')
      .set(bearer(token));
    expect(res.status).toBe(204);
  });
});

describe('POST /api/admin/notifications/read-all', () => {
  it('marks every currently-visible unread notification read for the caller', async () => {
    await seedNotification();
    await seedNotification({ requiredPermission: 'orders:view' });
    await seedNotification({ requiredPermission: 'products:manage' }); // not visible to this caller
    const { token } = await createStaffWith(['orders:view']);

    const before = await request(app).get('/api/admin/notifications').set(bearer(token));
    expect(before.body.unreadCount).toBe(2);

    const res = await request(app).post('/api/admin/notifications/read-all').set(bearer(token));
    expect(res.status).toBe(204);

    const after = await request(app).get('/api/admin/notifications').set(bearer(token));
    expect(after.body.unreadCount).toBe(0);
    // The one they never had visibility into wasn't touched either way —
    // nothing to assert on it directly since it stays invisible to them.
  });
});
