import type { Order, OrderItem } from '@prisma/client';
import { prisma } from '../../config/prisma';
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

// Bounded "recent feed" for the bell dropdown — this isn't a paginated
// history view, just the newest events, same "small bounded list" idiom as
// salesDashboard()'s recentOrders (take: 8).
const NOTIFICATION_FEED_LIMIT = 50;
const ADMIN_RETURNS_URL = `${env.FRONTEND_URL.replace(/\/+$/, '')}/en/admin/orders/returns`;

/**
 * Appends one row to the in-panel notification feed (see Notification /
 * NotificationRead in schema.prisma) — the durable, cross-device
 * counterpart to a Web Push alert, read by every admin's notification bell
 * regardless of whether they ever opted into push. Best-effort/never-
 * throws, same discipline as recordAudit(): a broken feed write must never
 * be able to fail the action that triggered it.
 */
export async function createNotification(entry: {
  type: string;
  title: string;
  body: string;
  url?: string;
  entityType?: string;
  entityID?: string;
  /** Same meaning as sendPushToAllAdmins' own param — null/omitted means
   *  every STAFF/ADMIN sees it regardless of their specific permissions. */
  requiredPermission?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        type: entry.type,
        title: entry.title,
        body: entry.body,
        url: entry.url ?? null,
        entityType: entry.entityType ?? null,
        entityID: entry.entityID ?? null,
        requiredPermission: entry.requiredPermission ?? null,
      },
    });
  } catch (err) {
    console.error(`[notification] failed to record ${entry.type}`, err);
  }
}

/**
 * Alerts the store owner by email, every opted-in STAFF/ADMIN browser by
 * push, and the in-panel bell — see lib/push.ts and createNotification()
 * above. Unlike email's single OWNER_NOTIFICATION_EMAIL target, push and the
 * bell are naturally many-to-one. Each channel no-ops (and reports `false`
 * for email/push) when unconfigured, same "boots without it" pattern as the
 * rest of the notification stack, so none of them can ever fail checkout.
 */
export async function sendOwnerNotification(order: OrderWithItems): Promise<{ email: boolean; push: boolean }> {
  const [email, push] = await Promise.all([
    env.OWNER_NOTIFICATION_EMAIL ? sendOwnerOrderAlertEmail(env.OWNER_NOTIFICATION_EMAIL, order) : false,
    sendPushToAllAdmins(
      {
        title: `New order ${order.orderNumber}`,
        body: `$${Number(order.total).toFixed(2)} (COD) — ${order.deliveryName}`,
        url: ADMIN_ORDERS_URL,
      },
      'orders:view'
    ).then(
      () => true,
      () => false
    ),
  ]);
  await createNotification({
    type: 'order.created',
    title: `New order ${order.orderNumber}`,
    body: `$${Number(order.total).toFixed(2)} (COD) — ${order.deliveryName}`,
    url: ADMIN_ORDERS_URL,
    entityType: 'order',
    entityID: order.id,
    requiredPermission: 'orders:view',
  });
  return { email, push };
}

/** Same shape as sendOwnerNotification, for a cancellation instead of a new order. */
export async function sendOwnerCancellationNotification(
  order: OrderWithItems
): Promise<{ email: boolean; push: boolean }> {
  const [email, push] = await Promise.all([
    env.OWNER_NOTIFICATION_EMAIL ? sendOwnerOrderCancelledAlertEmail(env.OWNER_NOTIFICATION_EMAIL, order) : false,
    sendPushToAllAdmins(
      {
        title: `Order cancelled ${order.orderNumber}`,
        body: `$${Number(order.total).toFixed(2)} — ${order.deliveryName}`,
        url: ADMIN_ORDERS_URL,
      },
      'orders:view'
    ).then(
      () => true,
      () => false
    ),
  ]);
  await createNotification({
    type: 'order.cancelled',
    title: `Order cancelled ${order.orderNumber}`,
    body: `$${Number(order.total).toFixed(2)} — ${order.deliveryName}`,
    url: ADMIN_ORDERS_URL,
    entityType: 'order',
    entityID: order.id,
    requiredPermission: 'orders:view',
  });
  return { email, push };
}

/**
 * Push + in-panel bell for an order the anti-abuse velocity check flagged —
 * previously this fired only an AuditLog row, so a flagged order could sit
 * unnoticed until an admin happened to open the Orders page. No email (not
 * asked for; trivial to add later if wanted).
 */
export async function sendOwnerFlaggedNotification(order: OrderWithItems): Promise<void> {
  await Promise.all([
    sendPushToAllAdmins(
      {
        title: `Order flagged ${order.orderNumber}`,
        body: order.flaggedReason ?? `${order.deliveryName}'s order needs review`,
        url: ADMIN_ORDERS_URL,
      },
      'orders:view'
    ),
    createNotification({
      type: 'order.flagged',
      title: `Order flagged ${order.orderNumber}`,
      body: order.flaggedReason ?? `${order.deliveryName}'s order needs review`,
      url: ADMIN_ORDERS_URL,
      entityType: 'order',
      entityID: order.id,
      requiredPermission: 'orders:view',
    }),
  ]);
}

/** Push + in-panel bell for a new per-item return request. No email — the
 *  requester (customer or guest) has their own confirmation via the order
 *  detail/tracking page; this is purely the admin-side alert. */
export async function sendReturnRequestedNotification(
  ret: { id: string; refundAmount: unknown },
  order: { orderNumber: string }
): Promise<void> {
  const title = `Return requested — ${order.orderNumber}`;
  const body = ret.refundAmount != null ? `Refund amount: $${Number(ret.refundAmount).toFixed(2)}` : 'New return request';
  await Promise.all([
    sendPushToAllAdmins({ title, body, url: ADMIN_RETURNS_URL }, 'orders:view'),
    createNotification({
      type: 'return.requested',
      title,
      body,
      url: ADMIN_RETURNS_URL,
      entityType: 'return',
      entityID: ret.id,
      requiredPermission: 'orders:view',
    }),
  ]);
}

/** Push + in-panel bell for a return's status changing (approved, rejected,
 *  received, refunded, ...). */
export async function sendReturnStatusChangedNotification(
  ret: { id: string; status: string },
  order: { orderNumber: string }
): Promise<void> {
  const title = `Return ${ret.status.toLowerCase().replace('_', ' ')} — ${order.orderNumber}`;
  await Promise.all([
    sendPushToAllAdmins({ title, body: '', url: ADMIN_RETURNS_URL }, 'orders:view'),
    createNotification({
      type: 'return.status_changed',
      title,
      body: '',
      url: ADMIN_RETURNS_URL,
      entityType: 'return',
      entityID: ret.id,
      requiredPermission: 'orders:view',
    }),
  ]);
}

/**
 * Fires every order-placed notification (customer email, owner email + push
 * + bell) for a freshly created order. Intended to be called fire-and-
 * forget, after the order's transaction has committed — never throws, so a
 * notification failure can never affect the checkout response. `orderUrl`
 * is either a guest tracking link (a fresh OrderAccessToken) or, for a
 * logged-in customer, a direct link to /orders/[id] — see order.service.ts's
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
 * push + bell). Same fire-and-forget, never-throws, after-commit discipline
 * as sendOrderPlacedNotifications — see order.service.ts's finishCancellation().
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

// ---- In-panel bell/feed reads (backing GET/POST /api/admin/notifications) ----

/** `requiredPermission: null` rows are visible to every STAFF/ADMIN; any
 *  other value needs to be in `heldPermissions`. Same visibility rule used
 *  for both the list and the unread count, and for markAllNotificationsRead
 *  below — a notification a caller can't see must never be markable read by
 *  them either (nothing to leak, but keeps the two operations consistent). */
function visibleNotificationsWhere(heldPermissions: Set<string>) {
  return {
    OR: [{ requiredPermission: null }, { requiredPermission: { in: Array.from(heldPermissions) } }],
  };
}

export async function listNotificationsForUser(
  userId: string,
  heldPermissions: Set<string>,
  opts: { unreadOnly?: boolean } = {}
) {
  const visible = visibleNotificationsWhere(heldPermissions);
  // unreadCount is its OWN query, never derived from the (possibly
  // truncated) list below — otherwise the badge would silently undercount
  // once unread items exceed NOTIFICATION_FEED_LIMIT.
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { ...visible, ...(opts.unreadOnly ? { reads: { none: { userID: userId } } } : {}) },
      orderBy: { dateCreated: 'desc' },
      take: NOTIFICATION_FEED_LIMIT,
      include: { reads: { where: { userID: userId }, select: { id: true } } },
    }),
    prisma.notification.count({ where: { ...visible, reads: { none: { userID: userId } } } }),
  ]);
  const notifications = rows.map(({ reads, ...n }) => ({ ...n, read: reads.length > 0 }));
  return { notifications, unreadCount };
}

/** No-ops (doesn't throw) for an id that doesn't exist or isn't visible to
 *  this caller's permissions — same "don't confirm/deny existence" instinct
 *  as the rest of this app's enumeration-resistant endpoints, and there's
 *  nothing meaningfully different a caller could observe from a 204 either
 *  way, so a friendlier "quietly do nothing" beats a NOT_FOUND here. */
export async function markNotificationRead(
  notificationId: string,
  userId: string,
  heldPermissions: Set<string>
): Promise<void> {
  const visible = await prisma.notification.findFirst({
    where: { id: notificationId, ...visibleNotificationsWhere(heldPermissions) },
    select: { id: true },
  });
  if (!visible) return;
  await prisma.notificationRead.upsert({
    where: { notificationID_userID: { notificationID: notificationId, userID: userId } },
    create: { notificationID: notificationId, userID: userId },
    update: {},
  });
}

export async function markAllNotificationsRead(userId: string, heldPermissions: Set<string>): Promise<void> {
  const unread = await prisma.notification.findMany({
    where: { ...visibleNotificationsWhere(heldPermissions), reads: { none: { userID: userId } } },
    select: { id: true },
  });
  if (unread.length === 0) return;
  await prisma.notificationRead.createMany({
    data: unread.map((n) => ({ notificationID: n.id, userID: userId })),
    skipDuplicates: true,
  });
}
