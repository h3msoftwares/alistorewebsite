import { Prisma, ReturnStatus, type OrderStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { recordAudit } from '../../lib/audit';
import { calculateKeptRefund, moneyCents, readPurchasePricing, type RefundCalculation } from '../../lib/return-pricing';
import {
  sendReturnRequestedNotification,
  sendReturnStatusChangedNotification,
} from '../../lib/notifications/notification.service';
import { createReturnRecords } from './return-records';
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

async function prepareReturn(tx: Prisma.TransactionClient, orderId: string, items: ReturnRequestItem[]) {
  // All claims and finalizations share this lock, including previews. Preview
  // does not reserve anything; submission validates again under the same lock.
  await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  if (order.status !== 'DELIVERED') throw new AppError('CONFLICT', 'Only delivered orders can have a return requested');
  if (!items.length || new Set(items.map((i) => i.orderItemID)).size !== items.length) {
    throw new AppError('VALIDATION_ERROR', 'Select each order line once');
  }
  const prior = await tx.returnItem.findMany({
    where: { orderItemID: { in: items.map((i) => i.orderItemID) }, return: { status: { notIn: ['REJECTED', 'CANCELLED'] } } },
    include: { return: { select: { status: true } } },
  });
  const calculations = items.map(({ orderItemID, quantity }) => {
    const line = order.items.find((i) => i.id === orderItemID);
    if (!line) throw new AppError('VALIDATION_ERROR', 'One of the selected items does not belong to this order');
    const remaining = line.quantity - line.returnedQuantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining) {
      throw new AppError('CONFLICT', `Only ${remaining} unit(s) of ${line.productName} can still be returned`, { orderItemID, remaining });
    }
    const s = readPurchasePricing(line.priceBreakdown);
    const history = prior.filter((i) => i.orderItemID === orderItemID);
    if (s && (s.rule !== null || s.couponDiscountCents > 0) && history.some((i) => i.return.status !== 'REFUNDED')) {
      throw new AppError('CONFLICT', 'Resolve the existing return for this line before requesting another', { orderItemID });
    }
    const previousRefundCents = history.filter((i) => i.return.status === 'REFUNDED').reduce((sum, i) => sum + moneyCents(i.refundAmount), 0);
    // Undiscounted/historical lines may keep their existing parallel-return
    // behavior. Reserve their pending amounts without calling them issued.
    const reservedRefundCents = history.filter((i) => i.return.status !== 'REFUNDED').reduce((sum, i) => sum + moneyCents(i.refundAmount), 0);
    const returnedQuantity = history.reduce((sum, i) => sum + i.quantity, quantity);
    let refundBreakdown: RefundCalculation | undefined;
    let refundCents: number;
    if (s) {
      if (s.quantity !== line.quantity || s.netLineTotalCents !== moneyCents(line.lineTotal)) {
        throw new AppError('CONFLICT', 'Purchase pricing snapshot does not match the order line');
      }
      refundBreakdown = calculateKeptRefund(s, returnedQuantity, previousRefundCents, reservedRefundCents);
      refundCents = refundBreakdown.refundCents;
    } else {
      // Historical null/v1 snapshots retain the existing unit-price policy,
      // bounded by the original line amount (including its last rounding cent).
      refundCents = Math.max(0, Math.min(moneyCents(line.unitPrice) * quantity, moneyCents(line.lineTotal) - previousRefundCents - reservedRefundCents));
    }
    return { orderItemID, productName: line.productName, quantity, refundCents, refundBreakdown };
  });
  return { items: calculations, refundCents: calculations.reduce((sum, item) => sum + item.refundCents, 0) };
}

export async function previewReturn(orderId: string, items: ReturnRequestItem[]) {
  return prisma.$transaction((tx) => prepareReturn(tx, orderId, items));
}

export async function previewOwnedReturn(orderId: string, userID: string, items: ReturnRequestItem[]) {
  const owned = await prisma.order.findFirst({ where: { id: orderId, userID }, select: { id: true } });
  if (!owned) throw new AppError('NOT_FOUND', 'Order not found');
  return previewReturn(orderId, items);
}

export async function previewReturnByToken(token: string, items: ReturnRequestItem[]) {
  const record = await findValidAccessToken(token);
  if (!record) throw new AppError('NOT_FOUND', 'Order not found');
  return previewReturn(record.orderID, items);
}

/**
 * The one place that actually creates a Return: validates the order is
 * DELIVERED, that every requested line belongs to it, and atomically claims
 * `returnedQuantity` per line before creating the Return + ReturnItem rows.
 * The order row lock serializes quantity checks, pricing history, and claims
 * with every return finalization/cancellation. Concurrent requests cannot
 * both allocate a discounted line or exceed the purchased quantity.
 */
async function performReturnRequest(
  orderId: string,
  items: ReturnRequestItem[],
  reason: string | undefined,
  requestedBy: string | undefined,
  expectedRefundCents?: number
) {
  return prisma.$transaction(async (tx) => {
    const preview = await prepareReturn(tx, orderId, items);
    if (expectedRefundCents !== undefined && expectedRefundCents !== preview.refundCents) {
      throw new AppError('CONFLICT', 'The refund changed. Preview it again before submitting.', { refundCents: preview.refundCents });
    }
    const created = await createReturnRecords(tx, orderId, preview.items, requestedBy, reason);
    return tx.return.findUniqueOrThrow({ where: { id: created.id }, include: RETURN_INCLUDE });
  });
}

/** Session-based return request — the logged-in customer's own order. */
export async function requestReturn(
  orderId: string,
  userID: string,
  items: ReturnRequestItem[],
  reason?: string,
  expectedRefundCents?: number
) {
  const owned = await prisma.order.findFirst({ where: { id: orderId, userID }, select: { id: true } });
  if (!owned) throw new AppError('NOT_FOUND', 'Order not found');
  const ret = await performReturnRequest(orderId, items, reason, userID, expectedRefundCents);
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
  reason?: string,
  expectedRefundCents?: number
) {
  const ret = await performReturnRequest(orderId, items, reason, actorId, expectedRefundCents);
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
export async function requestReturnByToken(rawToken: string, items: ReturnRequestItem[], reason?: string, expectedRefundCents?: number) {
  const record = await findValidAccessToken(rawToken);
  if (!record) throw new AppError('NOT_FOUND', 'Order not found');
  const ret = await performReturnRequest(record.orderID, items, reason, undefined, expectedRefundCents);
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
    await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
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
    // Cancellation claims this same order row before calculating its remaining
    // restock. Whichever operation wins, each unit is restored only once.
    const [order] = await tx.$queryRaw<{ status: OrderStatus }[]>`
      SELECT "status" FROM "order" WHERE "id" = ${existing.orderID}::uuid FOR UPDATE
    `;
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
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

    // A whole-order cancellation/return has already accounted for every unit.
    // An outstanding return may still be received, but must not restock again.
    if (next === 'RECEIVED' && order.status !== 'CANCELLED' && order.status !== 'RETURNED') {
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
