import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/AppError';
import { calculateBundleRefund, type BundleRefundCalculation, type BundleReturnPurchase } from '../../lib/bundle-return-pricing';
import { moneyCents } from '../../lib/return-pricing';

type Line = { id: string; quantity: number; returnedQuantity: number; lineTotal: Prisma.Decimal; priceBreakdown: Prisma.JsonValue; productName: string };

/** Caller holds the order lock. Validate ALL group links so v3 can never
 * fall through to the historical per-line calculation on missing evidence. */
export async function prepareBundleReturns(tx: Prisma.TransactionClient, orderID: string, lines: Line[], requested: { orderItemID: string; quantity: number }[]) {
  const groups = await tx.orderBundle.findMany({ where: { orderID }, include: { components: true } });
  const purchases: BundleReturnPurchase[] = groups.map(g => ({ orderBundleID: g.id, nameEn: g.nameEn, nameAr: g.nameAr,
    instanceCount: g.instanceCount, flatPriceCents: moneyCents(g.flatPrice), originalNetCents: 0,
    components: g.components.map(c => {
      const line = lines.find(l => l.id === c.orderItemID);
      const s = line?.priceBreakdown;
      if (!line || !s || typeof s !== 'object' || Array.isArray(s) || s.version !== 3 || s.bundleID !== g.bundleID
        || s.quantity !== line.quantity || s.netLineTotalCents !== moneyCents(line.lineTotal)
        || s.individualUnitPriceCents !== moneyCents(c.individualPrice) || s.couponDiscountCents !== 0) {
        throw new AppError('CONFLICT', 'Bundle purchase snapshot does not match the order lines');
      }
      return { orderItemID: line.id, productName: line.productName, quantity: line.quantity,
        requiredQuantity: c.requiredQuantity, individualPriceCents: moneyCents(c.individualPrice) };
    }) }));
  const byLine = new Map<string, BundleReturnPurchase>();
  for (const purchase of purchases) {
    for (const c of purchase.components) {
      if (byLine.has(c.orderItemID)) throw new AppError('CONFLICT', 'Overlapping bundle purchase snapshots');
      byLine.set(c.orderItemID, purchase);
      purchase.originalNetCents += moneyCents(lines.find(l => l.id === c.orderItemID)!.lineTotal);
    }
  }
  if (lines.some(l => l.priceBreakdown && typeof l.priceBreakdown === 'object' && !Array.isArray(l.priceBreakdown)
    && l.priceBreakdown.version === 3 && !byLine.has(l.id))) throw new AppError('CONFLICT', 'Bundle purchase snapshot is missing');
  const calculations: BundleRefundCalculation[] = [];
  for (const purchase of purchases) {
    const selected = requested.filter(r => byLine.get(r.orderItemID) === purchase);
    if (!selected.length) continue;
    const ids = purchase.components.map(c => c.orderItemID);
    const prior = await tx.returnItem.findMany({ where: { orderItemID: { in: ids }, return: { status: { notIn: ['REJECTED', 'CANCELLED'] } } },
      include: { return: { select: { status: true, bundleCalculations: true } } } });
    if (prior.some(p => p.return.status !== 'REFUNDED')) throw new AppError('CONFLICT',
      'Resolve the existing return for this Bundle before requesting another', { reason: 'BUNDLE_RETURN_PENDING', orderBundleID: purchase.orderBundleID });
    const previous = new Map(prior.map(p => {
      const evidence = p.return.bundleCalculations.find(c => c.orderBundleID === purchase.orderBundleID);
      if (!evidence) throw new AppError('CONFLICT', 'Bundle return calculation evidence is missing');
      return [p.returnID, moneyCents(evidence.refundAmount)] as const;
    }));
    const previouslyReturned = Object.fromEntries(ids.map(id => [id, prior.filter(p => p.orderItemID === id).reduce((n, p) => n + p.quantity, 0)]));
    if (ids.some(id => lines.find(l => l.id === id)!.returnedQuantity !== previouslyReturned[id])) {
      throw new AppError('CONFLICT', 'Bundle return quantities do not match the order lines');
    }
    calculations.push(calculateBundleRefund(purchase, previouslyReturned, selected, [...previous.values()].reduce((n, v) => n + v, 0)));
  }
  return { byLine, calculations };
}

/** Actual merchandise paid for a group never exceeds its purchased total.
 * No per-component purchase-allocation cap: breaking a recipe transfers
 * entitlement across its lines. Existing ordinary-line policy is unchanged. */
export async function checkBundlePayoutCaps(tx: Prisma.TransactionClient, orderID: string,
  items: { id: string; orderItemID: string }[], allocations: { id: string; cents: number }[]) {
  const groups = await tx.orderBundle.findMany({ where: { orderID }, include: { components: { include: { orderItem: true } } } });
  for (const group of groups) {
    const ids = group.components.map(c => c.orderItemID);
    const selected = items.filter(i => ids.includes(i.orderItemID));
    if (!selected.length) continue;
    const originalNetCents = group.components.reduce((n, c) => n + moneyCents(c.orderItem.lineTotal), 0);
    const previous = await tx.returnItem.findMany({ where: { orderItemID: { in: ids }, return: { status: 'REFUNDED' } } });
    const alreadyPaid = previous.reduce((n, i) => n + moneyCents(i.refundedAmount ?? i.refundAmount), 0);
    const paying = selected.reduce((n, i) => n + allocations.find(a => a.id === i.id)!.cents, 0);
    if (alreadyPaid + paying > originalNetCents) throw new AppError('CONFLICT', 'Amount exceeds remaining Bundle refundable',
      { reason: 'EXCEEDS_BUNDLE_REFUNDABLE', orderBundleID: group.id, remainingBundleRefundableCents: Math.max(0, originalNetCents - alreadyPaid) });
  }
}
