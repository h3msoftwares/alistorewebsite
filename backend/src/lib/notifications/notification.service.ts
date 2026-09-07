import type { Order, OrderItem } from '@prisma/client';
import { env } from '../../config/env';
import { sendOrderConfirmationEmail, sendOwnerOrderAlertEmail } from '../mailer';

type OrderWithItems = Order & { items: OrderItem[] };

// Customer email is the one function that already lives in mailer.ts (same
// shape as sendPasswordResetEmail/sendVerificationEmail) — re-exported here
// so every order notification is reachable from this one module.
export { sendOrderConfirmationEmail };

/**
 * Alerts the store owner by email. No-ops (and reports `false`) when
 * OWNER_NOTIFICATION_EMAIL isn't set — same "boots without it" pattern as
 * the rest of the notification stack, so an unconfigured owner address can
 * never fail checkout.
 */
export async function sendOwnerNotification(order: OrderWithItems): Promise<{ email: boolean }> {
  const email = env.OWNER_NOTIFICATION_EMAIL
    ? await sendOwnerOrderAlertEmail(env.OWNER_NOTIFICATION_EMAIL, order)
    : false;
  return { email };
}

/**
 * Fires every order-placed notification (customer email, owner email) for a
 * freshly created order. Intended to be called fire-and-forget, after the
 * order's transaction has committed — never throws, so a notification
 * failure can never affect the checkout response.
 */
export async function sendOrderPlacedNotifications(order: OrderWithItems): Promise<void> {
  await Promise.all([
    order.guestEmail ? sendOrderConfirmationEmail(order.guestEmail, order) : Promise.resolve(false),
    sendOwnerNotification(order),
  ]);
}
