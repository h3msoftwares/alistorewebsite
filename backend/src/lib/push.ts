import webpush from 'web-push';
import { prisma } from '../config/prisma';
import { env } from '../config/env';

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Pushes `payload` to every STAFF/ADMIN user's saved subscription — see
 * PushSubscription in schema.prisma. No-ops (and logs) when VAPID keys
 * aren't configured, same "boots without it" pattern as the rest of the
 * notification stack (mailer.ts's SMTP_HOST check).
 *
 * Never throws: each subscription is sent independently, and a dead one —
 * the push service returning 404/410, meaning the browser unsubscribed or
 * the endpoint expired — is deleted so it stops being retried forever. Any
 * other failure is logged and otherwise ignored.
 */
export async function sendPushToAllAdmins(payload: PushPayload): Promise<void> {
  if (!configured) {
    console.warn('[push] VAPID keys are not configured — skipping admin push notifications');
    return;
  }

  // Role is re-checked here, not just at subscribe time, so a since-demoted
  // admin's stale subscription row is never pushed to.
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: { role: { in: ['STAFF', 'ADMIN'] } } },
  });

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
