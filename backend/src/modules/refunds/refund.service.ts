import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { moneyCents } from '../../lib/return-pricing';
import { collectionTotals } from '../payments/collection.service';
import { cashPayoutSchema, createGoodwillSchema, cancelGoodwillSchema, type CashPayoutInput } from './refund.schema';

type Totals = Awaited<ReturnType<typeof collectionTotals>>;
function remaining(before: Totals, after: Totals) {
  return { remainingRefundableBeforeCents: before.remainingRefundableCents, remainingRefundableAfterCents: after.remainingRefundableCents,
    remainingDeliveryRefundableBeforeCents: before.remainingDeliveryRefundableCents, remainingDeliveryRefundableAfterCents: after.remainingDeliveryRefundableCents,
    remainingTotalRefundableBeforeCents: before.remainingTotalRefundableCents, remainingTotalRefundableAfterCents: after.remainingTotalRefundableCents };
}
export async function recordCashPayout(tx: Prisma.TransactionClient, source: { orderID: string; returnID?: string; goodwillRefundID?: string },
  amountCents: number, input: CashPayoutInput, actorID: string, before: Totals, after: Totals) {
  const parsed = cashPayoutSchema.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Payer name and a valid non-future payout date are required');
  const actor = await tx.user.findUniqueOrThrow({ where: { id: actorID }, select: { name: true } });
  const payout = await tx.refundPayout.create({ data: { ...source, amount: (amountCents / 100).toFixed(2), currency: before.currency,
    method: 'CASH', ...parsed.data, paidOn: new Date(`${parsed.data.paidOn}T00:00:00Z`), actorID, actorName: actor.name } });
  await tx.auditLog.create({ data: { entityType: 'refundPayout', entityID: payout.id, actorID, action: 'refund.payout_recorded',
    metadata: { ...source, amountCents, currency: before.currency, actorID, payerName: payout.payerName,
      paidOn: parsed.data.paidOn, reference: payout.reference, note: payout.note, ...remaining(before, after) } } });
  return payout;
}
async function lockOrder(tx: Prisma.TransactionClient, orderID: string) {
  const rows = await tx.$queryRaw`SELECT id FROM "order" WHERE id = ${orderID}::uuid FOR UPDATE`;
  if (!(rows as unknown[]).length) throw new AppError('NOT_FOUND', 'Order not found');
}
async function auditGoodwill(tx: Prisma.TransactionClient, refund: { id: string; orderID: string; amount: Prisma.Decimal },
  action: string, actorID: string, before: Totals, after: Totals, reason: string, payerName: string | null = null) {
  await tx.auditLog.create({ data: { entityType: 'goodwillRefund', entityID: refund.id, action, actorID,
    metadata: { orderID: refund.orderID, amountCents: moneyCents(refund.amount), currency: before.currency,
      actorID, payerName, reason, ...remaining(before, after) } } });
}
export async function createGoodwill(orderID: string, input: CreateGoodwillInput, actorID: string) {
  const parsed = createGoodwillSchema.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'A positive amount, reason and valid cash payout details are required');
  const body = parsed.data;
  return prisma.$transaction(async tx => {
    await lockOrder(tx, orderID);
    const before = await collectionTotals(tx, orderID);
    if (!before.collectionCount) throw new AppError('CONFLICT', 'Collection evidence is required for goodwill refunds', { reason: 'NO_COLLECTION_RECORDED' });
    // Invariant: merchandise + delivery + goodwill (OWED or PAID) never exceeds
    // net collected. Creation, return marking and collection reversal share the order lock.
    if (body.amountCents > before.remainingTotalRefundableCents) throw new AppError('CONFLICT', 'Refund would exceed net collected', { reason: 'EXCEEDS_NET_COLLECTED' });
    let refund = await tx.goodwillRefund.create({ data: { orderID, amount: (body.amountCents / 100).toFixed(2), reason: body.reason, createdBy: actorID } });
    const after = await collectionTotals(tx, orderID);
    await auditGoodwill(tx, refund, 'goodwill.created', actorID, before, after, body.reason, body.payout?.payerName ?? null);
    if (body.paidNow && body.payout) {
      refund = await tx.goodwillRefund.update({ where: { id: refund.id }, data: { status: 'PAID' } });
      await recordCashPayout(tx, { orderID, goodwillRefundID: refund.id }, body.amountCents, body.payout, actorID, after, after);
      await auditGoodwill(tx, refund, 'goodwill.paid', actorID, after, after, refund.reason, body.payout.payerName);
    }
    return tx.goodwillRefund.findUniqueOrThrow({ where: { id: refund.id }, include: { payout: true } });
  });
}
type CreateGoodwillInput = import('zod').input<typeof createGoodwillSchema>;
export async function payGoodwill(orderID: string, id: string, input: CashPayoutInput, actorID: string) {
  return prisma.$transaction(async tx => {
    await lockOrder(tx, orderID);
    const refund = await tx.goodwillRefund.findUnique({ where: { id } });
    if (!refund || refund.orderID !== orderID) throw new AppError('NOT_FOUND', 'Goodwill refund not found');
    if (refund.status !== 'OWED') throw new AppError('CONFLICT', 'Only owed goodwill refunds can be paid');
    const before = await collectionTotals(tx, orderID);
    await tx.goodwillRefund.update({ where: { id }, data: { status: 'PAID' } });
    const payout = await recordCashPayout(tx, { orderID, goodwillRefundID: id }, moneyCents(refund.amount), input, actorID, before, before);
    await auditGoodwill(tx, refund, 'goodwill.paid', actorID, before, before, refund.reason, payout.payerName);
    return tx.goodwillRefund.findUniqueOrThrow({ where: { id }, include: { payout: true } });
  });
}
export async function cancelGoodwill(orderID: string, id: string, input: { reason: string }, actorID: string) {
  const parsed = cancelGoodwillSchema.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'A cancellation reason is required');
  return prisma.$transaction(async tx => {
    await lockOrder(tx, orderID);
    const refund = await tx.goodwillRefund.findUnique({ where: { id } });
    if (!refund || refund.orderID !== orderID) throw new AppError('NOT_FOUND', 'Goodwill refund not found');
    if (refund.status !== 'OWED') throw new AppError('CONFLICT', 'Only owed goodwill refunds can be cancelled');
    const before = await collectionTotals(tx, orderID);
    const updated = await tx.goodwillRefund.update({ where: { id }, data: { status: 'CANCELLED', cancelledBy: actorID,
      cancelledAt: new Date(), cancellationReason: parsed.data.reason } });
    await auditGoodwill(tx, updated, 'goodwill.cancelled', actorID, before, await collectionTotals(tx, orderID), parsed.data.reason);
    return updated;
  });
}
export async function getRefundSummary(orderID: string) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw`SELECT id FROM "order" WHERE id = ${orderID}::uuid FOR SHARE`;
    if (!(rows as unknown[]).length) throw new AppError('NOT_FOUND', 'Order not found');
    return { ...await collectionTotals(tx, orderID),
      payouts: await tx.refundPayout.findMany({ where: { orderID }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
      goodwillRefunds: await tx.goodwillRefund.findMany({ where: { orderID }, include: { payout: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    };
  });
}
