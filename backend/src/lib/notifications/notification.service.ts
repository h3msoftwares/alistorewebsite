import type { Order, OrderItem } from '@prisma/client';
import { env } from '../../config/env';
import {
  sendOrderConfirmationEmail,
  sendOwnerOrderAlertEmail,
  sendOrderCancelledEmail,
  sendOwnerOrderCancelledAlertEmail,
  sendOrderShippedEmail,
} from '../mailer';
import { sendPushToAllAdmins } from '../push';

type OrderWithItems = Order & { items: OrderItem[] };

// Customer emails are the two functions that already live in mailer.ts
// (same shape as sendPasswordResetEmail/sendVerificationEmail) — re-exported
// here so every order notification is reachable from this one module.
export { sendOrderConfirmationEmail, sendOrderCancelledEmail };

const ADMIN_ORDERS_URL = `${env.FRONTEND_URL.replace(/\/+$/, '')}/en/admin/orders`;

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
      url: ADMIN_ORDERS_URL,
    }).then(
      () => true,
      () => false
    ),
  ]);
  return { email, push };
}

/** Same shape as sendOwnerNotification, for a cancellation instead of a new order. */
export async function sendOwnerCancellationNotification(
  order: OrderWithItems
): Promise<{ email: boolean; push: boolean }> {
  const [email, push] = await Promise.all([
    env.OWNER_NOTIFICATION_EMAIL ? sendOwnerOrderCancelledAlertEmail(env.OWNER_NOTIFICATION_EMAIL, order) : false,
    sendPushToAllAdmins({
      title: `Order cancelled ${order.orderNumber}`,
      body: `$${Number(order.total).toFixed(2)} — ${order.deliveryName}`,
      url: ADMIN_ORDERS_URL,
    }).then(
      () => true,
      () => false
    ),
  ]);
  return { email, push };
}

/**
 * Fires every order-placed notification (customer email, owner email + push)
 * for a freshly created order. Intended to be called fire-and-forget, after
 * the order's transaction has committed — never throws, so a notification
 * failure can never affect the checkout response. `orderUrl` is either a
 * guest tracking link (a fresh OrderAccessToken) or, for a logged-in
 * customer, a direct link to /orders/[id] — see order.service.ts's
 * checkout().
 */
export async function sendOrderPlacedNotifications(order: OrderWithItems, orderUrl: string): Promise<void> {
  await Promise.all([
    order.guestEmail ? sendOrderConfirmationEmail(order.guestEmail, order, orderUrl) : Promise.resolve(false),
    sendOwnerNotification(order),
  ]);
}

/**
 * Fires every order-cancelled notification (customer email, owner email +
 * push). Same fire-and-forget, never-throws, after-commit discipline as
 * sendOrderPlacedNotifications — see order.service.ts's finishCancellation().
 */
export async function sendOrderCancelledNotifications(order: OrderWithItems): Promise<void> {
  await Promise.all([
    order.guestEmail ? sendOrderCancelledEmail(order.guestEmail, order) : Promise.resolve(false),
    sendOwnerCancellationNotification(order),
  ]);
}

/**
 * Emails the customer that their order has shipped (with the admin's delivery
 * estimate when set). `order.guestEmail` holds the contact email for BOTH
 * guest and signed-in orders — see order.service.ts checkout(). Same
 * fire-and-forget, never-throws, after-commit discipline as the others.
 */
export async function sendOrderShippedNotifications(order: OrderWithItems): Promise<void> {
  if (!order.guestEmail) return;
  await sendOrderShippedEmail(order.guestEmail, order, order.estimatedDeliveryDays);
}
