import { prisma } from '../../config/prisma';

interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Saves (or refreshes) one admin's push subscription. `endpoint` is
 * naturally unique per browser subscription, so this is an upsert keyed on
 * it — the same browser re-subscribing (e.g. after re-granting permission)
 * overwrites its own row instead of creating a duplicate. If the same
 * endpoint was previously saved under a different account (a shared
 * machine, a different admin logged in), the latest subscriber takes over
 * ownership going forward.
 */
export async function saveSubscription(userId: string, input: SubscriptionInput, userAgent?: string) {
  const data = {
    userID: userId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent ?? null,
  };
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { ...data, endpoint: input.endpoint },
    update: data,
  });
}

/**
 * Removes one subscription. Scoped to the caller via `deleteMany` (not
 * `delete`) so it's idempotent: an endpoint that doesn't exist, or belongs
 * to someone else, both silently no-op rather than throwing — the caller
 * only ever wants "my browser stops getting these," not proof it happened.
 */
export async function deleteSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userID: userId } });
}
