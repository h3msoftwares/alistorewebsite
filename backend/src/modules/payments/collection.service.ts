import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { moneyCents } from '../../lib/return-pricing';
import { markCollectedSchema, type CollectionInput } from './collection.schema';

/** Delivery is collected first. No settlement or delivery-refund inference. */
export function remainingRefundableCents(collectedCents: number, deliveryFeeCents: number, markedRefundedCents: number): number {
  return Math.max(0, collectedCents - deliveryFeeCents - markedRefundedCents);
}

export function remainingDeliveryRefundableCents(collectedCents: number, deliveryFeeCents: number, markedDeliveryRefundedCents: number): number {
  return Math.max(0, Math.min(deliveryFeeCents, collectedCents) - markedDeliveryRefundedCents);
}

function signedCents(value: Prisma.Decimal | null): number {
  return value ? moneyCents(value.abs()) * (value.isNegative() ? -1 : 1) : 0;
}

export type RefundBlockReason = 'NO_COLLECTION_RECORDED' | 'EXCEEDS_REMAINING_REFUNDABLE' | 'EXCEEDS_DELIVERY_REFUNDABLE' | 'EXCEEDS_NET_COLLECTED';
export function refundBlockReason(amountCents: number, summary: { collectionCount: number; remainingRefundableCents: number }): RefundBlockReason | null {
  if (amountCents === 0) return null;
  if (summary.collectionCount === 0) return 'NO_COLLECTION_RECORDED';
  return amountCents > summary.remainingRefundableCents ? 'EXCEEDS_REMAINING_REFUNDABLE' : null;
}

export async function collectionTotals(tx: Prisma.TransactionClient, orderID: string) {
  const order = await tx.order.findUnique({ where: { id: orderID }, select: { currency: true, total: true, deliveryFee: true } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  const [collections, refunds, deliveryRefunds] = await Promise.all([
    tx.codCollection.aggregate({ where: { orderID }, _sum: { amount: true }, _count: true }),
    tx.$queryRaw<{ amount: Prisma.Decimal }[]>`SELECT COALESCE(SUM(COALESCE(i."refundedAmount", i."refundAmount")), 0) AS amount
      FROM returnitem i JOIN "return" r ON r.id = i."returnID" WHERE r."orderID" = ${orderID}::uuid AND r.status = 'REFUNDED'`,
    tx.return.aggregate({ where: { orderID, status: 'REFUNDED' }, _sum: { deliveryRefundAmount: true } }),
  ]);
  const collectedCents = signedCents(collections._sum.amount);
  const markedRefundedCents = moneyCents(refunds[0].amount);
  const markedDeliveryRefundedCents = moneyCents(deliveryRefunds._sum.deliveryRefundAmount ?? 0);
  const deliveryFeeCents = moneyCents(order.deliveryFee);
  return { currency: order.currency, expectedTotalCents: moneyCents(order.total), deliveryFeeCents,
    collectedCents, markedRefundedCents, markedDeliveryRefundedCents, collectionCount: collections._count,
    remainingTotalRefundableCents: Math.max(0, collectedCents - markedRefundedCents - markedDeliveryRefundedCents),
    remainingDeliveryRefundableCents: remainingDeliveryRefundableCents(collectedCents, deliveryFeeCents, markedDeliveryRefundedCents),
    remainingRefundableCents: remainingRefundableCents(collectedCents, deliveryFeeCents, markedRefundedCents) };
}

export async function getCollectionSummary(orderID: string) {
  // A consistent read also prevents a summary mixing pre/post marking totals.
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderID}::uuid FOR SHARE`;
    if (!(rows as unknown[]).length) throw new AppError('NOT_FOUND', 'Order not found');
    const summary = await collectionTotals(tx, orderID);
    const records = await tx.codCollection.findMany({ where: { orderID }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return { ...summary, records };
  });
}

export async function recordCollection(orderID: string, input: CollectionInput, actorID: string) {
  const parsed = markCollectedSchema.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Collection evidence or a correction reason is required');
  const body = parsed.data;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderID}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderID } });
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    if (order.paymentMethod !== 'COD') throw new AppError('CONFLICT', 'Collection evidence is only supported for COD orders');
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorID }, select: { name: true } });
    const before = await collectionTotals(tx, orderID);
    let data: Prisma.CodCollectionUncheckedCreateInput;
    if (body.collected) {
      if (body.currency !== order.currency) throw new AppError('VALIDATION_ERROR', 'Collection currency must match the order currency');
      data = { orderID, actorID, actorName: actor.name, amount: body.amount.toFixed(2), currency: order.currency,
        collectedAt: new Date(body.collectedAt), collectorName: body.collectorName, reference: body.reference, note: body.note };
    } else {
      const original = await tx.codCollection.findUnique({ where: { id: body.collectionID }, include: { reversal: true } });
      if (!original || original.orderID !== orderID) throw new AppError('NOT_FOUND', 'Collection record not found on this order');
      if (original.reversalOfID || original.reversal) throw new AppError('CONFLICT', 'This collection cannot be reversed again');
      // Invariant: total marked refunded never exceeds net collected, checked
      // on both refund marking and collection reversal under the order lock.
      if (before.collectedCents - moneyCents(original.amount) < before.markedRefundedCents + before.markedDeliveryRefundedCents) {
        throw new AppError('CONFLICT', 'Correction would reduce collected money below the amount already marked refunded', { reason: 'COLLECTION_BELOW_MARKED_REFUNDS' });
      }
      data = { orderID, actorID, actorName: actor.name, amount: original.amount.negated(), currency: original.currency,
        collectedAt: original.collectedAt, collectorName: original.collectorName, reference: original.reference,
        reversalOfID: original.id, reason: body.reason };
    }
    const record = await tx.codCollection.create({ data });
    const after = await collectionTotals(tx, orderID);
    const updated = await tx.order.update({ where: { id: orderID }, data: {
      paymentStatus: after.collectedCents >= after.expectedTotalCents ? 'COLLECTED' : 'PENDING',
    } });
    await tx.auditLog.create({ data: { entityType: 'order', entityID: orderID, actorID,
      action: body.collected ? 'collection.recorded' : 'collection.corrected',
      metadata: { orderID, orderNumber: order.orderNumber, actorID, recordID: record.id,
        amountCents: signedCents(record.amount), currency: record.currency, reference: record.reference,
        collectorName: record.collectorName, collectedAt: record.collectedAt.toISOString(),
        reason: record.reason, reversalOfID: record.reversalOfID, collectedTotalCents: after.collectedCents } } });
    return { order: updated, record };
  });
}

/** Batch summaries for the admin returns list, without per-row queries. */
export async function returnRefundEligibility<T extends { orderID: string; items: { refundAmount: Prisma.Decimal }[] }>(returns: T[]) {
  const ids = [...new Set(returns.map((r) => r.orderID))];
  if (!ids.length) return [];
  const rows = await prisma.$queryRaw<{ id: string; count: bigint; collected: Prisma.Decimal; deliveryFee: Prisma.Decimal; marked: Prisma.Decimal; deliveryMarked: Prisma.Decimal }[]>(Prisma.sql`
    SELECT o.id, COALESCE(c.count, 0) AS count, COALESCE(c.amount, 0) AS collected, o."deliveryFee", COALESCE(r.amount, 0) AS marked, COALESCE(d.amount, 0) AS "deliveryMarked"
    FROM "order" o
    LEFT JOIN (SELECT "orderID", COUNT(*) AS count, SUM(amount) AS amount FROM codcollection GROUP BY "orderID") c ON c."orderID" = o.id
    LEFT JOIN (SELECT r."orderID", SUM(COALESCE(i."refundedAmount", i."refundAmount")) AS amount FROM "return" r JOIN returnitem i ON i."returnID" = r.id WHERE r.status = 'REFUNDED' GROUP BY r."orderID") r ON r."orderID" = o.id
    LEFT JOIN (SELECT "orderID", SUM("deliveryRefundAmount") AS amount FROM "return" WHERE status = 'REFUNDED' GROUP BY "orderID") d ON d."orderID" = o.id
    WHERE o.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
  `);
  const byID = new Map(rows.map((row) => [row.id, { collectionCount: Number(row.count),
    remainingTotalRefundableCents: Math.max(0, signedCents(row.collected) - moneyCents(row.marked) - moneyCents(row.deliveryMarked)),
    remainingDeliveryRefundableCents: remainingDeliveryRefundableCents(signedCents(row.collected), moneyCents(row.deliveryFee), moneyCents(row.deliveryMarked)),
    remainingRefundableCents: remainingRefundableCents(signedCents(row.collected), moneyCents(row.deliveryFee), moneyCents(row.marked)) }]));
  return returns.map((r) => {
    const summary = byID.get(r.orderID)!;
    const amountCents = r.items.reduce((sum, i) => sum + moneyCents(i.refundAmount), 0);
    return { ...r, refundEligibility: { ...summary, amountCents, blockReason: refundBlockReason(amountCents, summary) } };
  });
}
