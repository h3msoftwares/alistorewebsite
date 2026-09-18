import webpush from 'web-push';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { effectivePermissions } from './permissions';

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Pushes `payload` to STAFF/ADMIN subscribers — see PushSubscription in
 * schema.prisma. No-ops (and logs) when VAPID keys aren't configured, same
 * "boots without it" pattern as the rest of the notification stack
 * (mailer.ts's Gmail-connected check).
 *
 * `requiredPermission`, when given, additionally filters recipients to
 * those who actually hold it — computed with the same `effectivePermissions`
 * RBAC already uses (role + custom role + per-user revokes), not just
 * "any STAFF/ADMIN with a subscribed browser". Without this, a STAFF
 * account with zero granted permissions but a subscribed device would get
 * pushed order data they can't even open the Orders page to look at —
 * every order-related call site passes 'orders:view' here for exactly that
 * reason. Omit it only for something every admin/staff should see
 * regardless of their specific permissions.
 *
 * Never throws: each subscription is sent independently, and a dead one —
 * the push service returning 404/410, meaning the browser unsubscribed or
 * the endpoint expired — is deleted so it stops being retried forever. Any
 * other failure is logged and otherwise ignored.
 */
export async function sendPushToAllAdmins(payload: PushPayload, requiredPermission?: string): Promise<void> {
  if (!configured) {
    console.warn('[push] VAPID keys are not configured — skipping admin push notifications');
    return;
  }

  // Role is re-checked here, not just at subscribe time, so a since-demoted
  // admin's stale subscription row is never pushed to. The permission
  // fields are cheap to always join (this table is small) — simpler than a
  // conditionally-shaped query, and effectivePermissions() is only called
  // when requiredPermission is actually given.
  const allSubscriptions = await prisma.pushSubscription.findMany({
    where: { user: { role: { in: ['STAFF', 'ADMIN'] } } },
    include: { user: { select: { role: true, revokedPermissions: true, customRole: { select: { permissions: true } } } } },
  });
  const subscriptions = requiredPermission
    ? allSubscriptions.filter((sub) =>
        effectivePermissions({
          role: sub.user.role,
          rolePermissions: sub.user.customRole?.permissions ?? null,
          revoked: sub.user.revokedPermissions,
        }).has(requiredPermission)
      )
    : allSubscriptions;

  const vapidDetails = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { vapidDetails }
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error('[push] failed to send to', sub.endpoint, err);
        }
      }
    })
  );
}
