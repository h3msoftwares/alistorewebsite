import { Prisma, type OrderItem } from '@prisma/client';
import { AppError } from '../../lib/AppError';
import { calculateKeptRefund, moneyCents, readPurchasePricing, type RefundCalculation } from '../../lib/return-pricing';
import type { BundleRefundCalculation } from '../../lib/bundle-return-pricing';
import { prepareBundleReturns } from './bundle-return-calculation';

export interface CalculatedReturnItem {
  orderItemID: string;
  quantity: number;
  refundCents: number;
  refundBreakdown?: RefundCalculation;
}

/** Shared persistence for individual requests and whole-order receipt.
 * Caller holds the order lock and commits stock, status and these records together. */
export async function createReturnRecords(
  tx: Prisma.TransactionClient,
  orderID: string,
  items: CalculatedReturnItem[],
  requestedBy: string | undefined,
  reason: string | undefined,
  status: 'REQUESTED' | 'RECEIVED' = 'REQUESTED',
  bundleCalculations: BundleRefundCalculation[] = [],
) {
  for (const item of items) {
    await tx.orderItem.update({ where: { id: item.orderItemID }, data: { returnedQuantity: { increment: item.quantity } } });
  }
  const refundCents = items.reduce((sum, item) => sum + item.refundCents, 0);
  const created = await tx.return.create({ data: {
    orderID, requestedBy: requestedBy ?? null, reason, status, refundAmount: refundCents / 100,
    items: { create: items.map((item) => ({
      orderItemID: item.orderItemID, quantity: item.quantity, refundAmount: item.refundCents / 100,
      ...(item.refundBreakdown ? { refundBreakdown: item.refundBreakdown } : {}),
    })) },
    bundleCalculations: { create: bundleCalculations.map(c => ({
      orderBundleID: c.orderBundleID, refundAmount: c.refundCents / 100,
      calculation: c as unknown as Prisma.InputJsonValue,
    })) },
  } });
  const calculatedItems = items.filter((item) => item.refundBreakdown).map((item) => ({
    orderItemID: item.orderItemID, quantity: item.quantity, ...item.refundBreakdown,
  }));
  if (calculatedItems.length || bundleCalculations.length) await tx.auditLog.create({ data: {
    entityType: 'return', entityID: created.id, action: 'return.refund_calculated', actorID: requestedBy ?? null,
    metadata: { orderID, refundCents, items: calculatedItems,
      ...(bundleCalculations.length ? { bundles: bundleCalculations as unknown as Prisma.InputJsonValue } : {}) },
  } });
  if (status === 'RECEIVED') await tx.auditLog.create({ data: {
    entityType: 'return', entityID: created.id, action: 'return.whole_order_received', actorID: requestedBy ?? null,
    metadata: { orderID, refundCents, reason: reason ?? null },
  } });
  return created;
}

/** Only called after the shared existing-return guard has passed. No refund
 * is marked paid here: physical receipt and refund marking remain separate. */
export async function createWholeOrderReturn(
  tx: Prisma.TransactionClient, orderID: string, lines: OrderItem[], actorID?: string, reason = 'Whole-order return received'
) {
  const bundles = await prepareBundleReturns(tx, orderID, lines, lines.map(l => ({ orderItemID: l.id, quantity: l.quantity })));
  const items = lines.map((line) => {
    const snapshot = readPurchasePricing(line.priceBreakdown);
    if (line.returnedQuantity !== 0 || (snapshot && (snapshot.quantity !== line.quantity || snapshot.netLineTotalCents !== moneyCents(line.lineTotal)))) {
      throw new AppError('CONFLICT', 'Order line return quantities or pricing do not match; use per-item returns');
    }
    if (bundles.byLine.has(line.id)) return { orderItemID: line.id, quantity: line.quantity,
      refundCents: bundles.calculations.flatMap(c => c.allocations).find(a => a.orderItemID === line.id)!.refundCents };
    const refundBreakdown = snapshot ? calculateKeptRefund(snapshot, line.quantity, 0) : undefined;
    return { orderItemID: line.id, quantity: line.quantity,
      refundCents: refundBreakdown?.refundCents ?? moneyCents(line.lineTotal), refundBreakdown };
  });
  return createReturnRecords(tx, orderID, items, actorID, reason, 'RECEIVED', bundles.calculations);
}
