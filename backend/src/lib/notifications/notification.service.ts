import type { Order, OrderItem } from '@prisma/client';
import { env } from '../../config/env';
import { sendOrderConfirmationEmail, sendOwnerOrderAlertEmail } from '../mailer';
import { sendPushToAllAdmins } from '../push';

type OrderWithItems = Order & { items: OrderItem[] };

// Customer email is the one function that already lives in mailer.ts (same
// shape as sendPasswordResetEmail/sendVerificationEmail) — re-exported here
// so every order notification is reachable from this one module.
export { sendOrderConfirmationEmail };

/**
 * Alerts the store owner by email, and every opted-in STAFF/ADMIN browser by
 * push (see lib/push.ts). Unlike email's single OWNER_NOTIFICATION_EMAIL
 * target, push is naturally many-to-one — every admin who enabled it, on
 * every device they enabled it on, gets notified. Each channel no-ops (and
 * reports `false`) when unconfigured, same "boots without it" pattern as the
 * rest of the notification stack, so neither can ever fail checkout.
 */
export async function sendOwnerNotification(order: OrderWithItems): Promise<{ email: boolean; push: boolean }> {
  const [email, push] = await Promise.all([
    env.OWNER_NOTIFICATION_EMAIL ? sendOwnerOrderAlertEmail(env.OWNER_NOTIFICATION_EMAIL, order) : false,
    sendPushToAllAdmins({
      title: `New order ${order.orderNumber}`,
      body: `$${Number(order.total).toFixed(2)} (COD) — ${order.deliveryName}`,
      url: `${env.FRONTEND_URL.replace(/\/+$/, '')}/en/admin/orders`,
    }).then(
      () => true,
      () => false
    ),
  ]);
  return { email, push };
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
