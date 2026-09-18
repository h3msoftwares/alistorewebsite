import { Prisma, ReturnStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { recordAudit } from '../../lib/audit';
import { round2 } from '../../lib/money';
import {
  sendReturnRequestedNotification,
  sendReturnStatusChangedNotification,
} from '../../lib/notifications/notification.service';
import { findValidAccessToken } from '../orders/order.service';

export interface ReturnRequestItem {
  orderItemID: string;
  quantity: number;
}

const RETURN_INCLUDE = {
  items: {
    include: {
      orderItem: {
        select: { id: true, productName: true, variantSKU: true, size: true, color: true, quantity: true },
      },
    },
  },
  order: { select: { orderNumber: true } },
} satisfies Prisma.ReturnInclude;

const ADMIN_RETURN_INCLUDE = {
  ...RETURN_INCLUDE,
  order: {
    select: { orderNumber: true, deliveryName: true, deliveryPhone: true, guestEmail: true, status: true },
  },
  requester: { select: { name: true, email: true } },
} satisfies Prisma.ReturnInclude;

/**
 * The one place that actually creates a Return: validates the order is
 * DELIVERED, that every requested line belongs to it, and atomically claims
 * `returnedQuantity` per line before creating the Return + ReturnItem rows.
 * The claim is a guarded conditional UPDATE (predicate + write in one
 * statement, same shape as checkout's stock claim in order.service.ts) —
 * not a read-then-write — so two concurrent return requests against the
 * same line can never together claim more than its `quantity`.
 */
async function performReturnRequest(
  orderId: string,
  items: ReturnRequestItem[],
  reason: string | undefined,
  requestedBy: string | undefined
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    if (order.status !== 'DELIVERED') {
      throw new AppError('CONFLICT', 'Only delivered orders can have a return requested');
    }

    const orderItemsById = new Map(order.items.map((i) => [i.id, i]));
    const returnItemsData: { orderItemID: string; quantity: number; refundAmount: number }[] = [];
    let totalRefund = 0;

    for (const { orderItemID, quantity } of items) {
      const orderItem = orderItemsById.get(orderItemID);
      if (!orderItem) {
        throw new AppError('VALIDATION_ERROR', 'One of the selected items does not belong to this order');
      }
      const claimed = await tx.orderItem.updateMany({
        where: { id: orderItemID, returnedQuantity: { lte: orderItem.quantity - quantity } },
        data: { returnedQuantity: { increment: quantity } },
      });
      if (claimed.count === 0) {
        const remaining = Math.max(orderItem.quantity - orderItem.returnedQuantity, 0);
        throw new AppError(
          'CONFLICT',
          `Only ${remaining} unit(s) of ${orderItem.productName} can still be returned`,
          { orderItemID, remaining }
        );
      }
      const refundAmount = round2(Number(orderItem.unitPrice) * quantity);
      totalRefund = round2(totalRefund + refundAmount);
      returnItemsData.push({ orderItemID, quantity, refundAmount });
    }

    return tx.return.create({
      data: {
        orderID: orderId,
        reason,
        requestedBy: requestedBy ?? null,
        refundAmount: totalRefund,
        items: { create: returnItemsData },
      },
      include: RETURN_INCLUDE,
    });
  });
}

/** Session-based return request — the logged-in customer's own order. */
export async function requestReturn(
  orderId: string,
  userID: string,
  items: ReturnRequestItem[],
  reason?: string
) {
  const owned = await prisma.order.findFirst({ where: { id: orderId, userID }, select: { id: true } });
  if (!owned) throw new AppError('NOT_FOUND', 'Order not found');
  const ret = await performReturnRequest(orderId, items, reason, userID);
  await recordAudit({
    entityType: 'return',
    entityID: ret.id,
    action: 'return.requested',
    actorID: userID,
    metadata: { orderID: orderId, items },
  });
  void sendReturnRequestedNotification(ret, ret.order).catch((err) => {
    console.error('[return.service] failed to send return-requested notification', err);
  });
  return ret;
}

/** Staff-initiated return request — e.g. a phone order the customer can't
 *  self-serve online. Unlike `requestReturn`, there's no owning-customer
 *  check (staff can act on any order); everything else — the DELIVERED
 *  gate and the atomic returnedQuantity claim — is the same shared path. */
export async function adminRequestReturn(
  orderId: string,
  actorId: string,
  items: ReturnRequestItem[],
  reason?: string
) {
  const ret = await performReturnRequest(orderId, items, reason, actorId);
  await recordAudit({
    entityType: 'return',
    entityID: ret.id,
    action: 'return.requested',
    actorID: actorId,
    metadata: { orderID: orderId, items, via: 'admin' },
  });
  void sendReturnRequestedNotification(ret, ret.order).catch((err) => {
    console.error('[return.service] failed to send return-requested notification', err);
  });
  return ret;
}

/** Token-based return request — a guest's tracking-page "request a return",
 *  proven by the OrderAccessToken instead of a login session. */
export async function requestReturnByToken(rawToken: string, items: ReturnRequestItem[], reason?: string) {
  const record = await findValidAccessToken(rawToken);
  if (!record) throw new AppError('NOT_FOUND', 'Order not found');
  const ret = await performReturnRequest(record.orderID, items, reason, undefined);
  await recordAudit({
    entityType: 'return',
    entityID: ret.id,
    action: 'return.requested',
    metadata: { orderID: record.orderID, items, via: 'guest_token' },
  });
  void sendReturnRequestedNotification(ret, ret.order).catch((err) => {
    console.error('[return.service] failed to send return-requested notification', err);
  });
  return ret;
}

/** Withdraws a return before it's been received back — releases the
 *  `returnedQuantity` claim so those units are returnable again. Guarded
 *  the same way as order cancellation: an atomic conditional UPDATE, not a
 *  read-then-write, so a concurrent admin approval and a customer's
 *  cancel-click can't both "succeed" against a stale read. */
async function performCancelReturn(returnId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.return.findUnique({ where: { id: returnId }, include: { items: true } });
    if (!existing || existing.orderID !== orderId) throw new AppError('NOT_FOUND', 'Return not found');

    const claim = await tx.return.updateMany({
      where: { id: returnId, status: { in: ['REQUESTED', 'APPROVED', 'IN_TRANSIT'] } },
      data: { status: 'CANCELLED' },
    });
    if (claim.count === 0) {
      throw new AppError('CONFLICT', 'This return can no longer be cancelled');
    }

    for (const item of existing.items) {
      await tx.orderItem.update({
        where: { id: item.orderItemID },
        data: { returnedQuantity: { decrement: item.quantity } },
      });
    }

    return tx.return.findUniqueOrThrow({ where: { id: returnId }, include: RETURN_INCLUDE });
  });
}

export async function cancelReturn(orderId: string, userID: string, returnId: string) {
  const owned = await prisma.order.findFirst({ where: { id: orderId, userID }, select: { id: true } });
  if (!owned) throw new AppError('NOT_FOUND', 'Order not found');
  const ret = await performCancelReturn(returnId, orderId);
  await recordAudit({
    entityType: 'return',
    entityID: returnId,
    action: 'return.status_changed',
    actorID: userID,
    metadata: { to: 'CANCELLED' },
  });
  return ret;
}

export async function cancelReturnByToken(rawToken: string, returnId: string) {
  const record = await findValidAccessToken(rawToken);
  if (!record) throw new AppError('NOT_FOUND', 'Order not found');
  const ret = await performCancelReturn(returnId, record.orderID);
  await recordAudit({
    entityType: 'return',
    entityID: returnId,
    action: 'return.status_changed',
    metadata: { to: 'CANCELLED', via: 'guest_token' },
  });
  return ret;
}

// Explicit legal-transition table — a Return's status only ever moves
// forward along one of these paths; anything else is refused outright
// rather than silently no-op'd, so an admin's mis-click surfaces as an
// error instead of a confusing non-change.
const LEGAL_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['REFUNDED'],
  REJECTED: [],
  REFUNDED: [],
  CANCELLED: [],
};

/**
 * Admin-only status transition. Reaching RECEIVED is the only transition
 * that touches real inventory — restocks each line's variant and writes a
 * RETURN StockMovement per ReturnItem, symmetric with order.service.ts's own
 * restoreStock(). REJECTED/CANCELLED release the returnedQuantity claim
 * (those units are returnable again). REFUNDED is pure bookkeeping — this
 * store is COD-only with no payment gateway, so nothing here moves money or
 * touches Order.paymentStatus; a partial per-item refund must never be
 * mistaken for the whole order being refunded.
 *
 * The status flip is an atomic conditional UPDATE guarded on the exact
 * current status (not a broader set) — same "predicate + write in one
 * statement" idiom used throughout order.service.ts — so two admins racing
 * different next-transitions on the same Return can't both succeed.
 */
export async function updateReturnStatus(returnId: string, next: ReturnStatus, actorId?: string) {
  const { updated, previousStatus, orderNumber } = await prisma.$transaction(async (tx) => {
    const existing = await tx.return.findUnique({
      where: { id: returnId },
      include: { items: true, order: { select: { orderNumber: true } } },
    });
    if (!existing) throw new AppError('NOT_FOUND', 'Return not found');
    if (!LEGAL_TRANSITIONS[existing.status].includes(next)) {
      throw new AppError('CONFLICT', `Cannot move a return from ${existing.status} to ${next}`);
    }

    const claim = await tx.return.updateMany({
      where: { id: returnId, status: existing.status },
      data: { status: next },
    });
    if (claim.count === 0) {
      throw new AppError('CONFLICT', 'This return was already updated by someone else');
    }

    if (next === 'RECEIVED') {
      for (const item of existing.items) {
        const orderItem = await tx.orderItem.findUniqueOrThrow({ where: { id: item.orderItemID } });
        await tx.productVariant.update({
          where: { id: orderItem.variantID },
          data: { stockQuantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            variantID: orderItem.variantID,
            orderID: orderItem.orderID,
            orderItemID: item.orderItemID,
            quantity: item.quantity,
            type: 'RETURN',
            reason: `Return ${returnId} received`,
          },
        });
      }
    }

    if (next === 'REJECTED' || next === 'CANCELLED') {
      for (const item of existing.items) {
        await tx.orderItem.update({
          where: { id: item.orderItemID },
          data: { returnedQuantity: { decrement: item.quantity } },
        });
      }
    }

    const updated = await tx.return.findUniqueOrThrow({ where: { id: returnId }, include: RETURN_INCLUDE });
    return { updated, previousStatus: existing.status, orderNumber: existing.order.orderNumber };
  });

  await recordAudit({
    entityType: 'return',
    entityID: returnId,
    action: 'return.status_changed',
    actorID: actorId,
    metadata: { orderNumber, from: previousStatus, to: next },
  });
  void sendReturnStatusChangedNotification({ id: returnId, status: next }, { orderNumber }).catch((err) => {
    console.error('[return.service] failed to send return-status-changed notification', err);
  });

  return updated;
}

export async function listAdminReturns(statuses?: ReturnStatus[]) {
  return prisma.return.findMany({
    where: statuses?.length ? { status: { in: statuses } } : {},
    orderBy: { dateCreated: 'desc' },
    include: ADMIN_RETURN_INCLUDE,
  });
}
