import { AppError } from './AppError';
import { allocateRefundCents } from './refund-allocation';
import { bundlePriceBounds } from './bundle-pricing';

export interface BundleReturnPurchase {
  orderBundleID: string;
  nameEn: string;
  nameAr: string;
  instanceCount: number;
  flatPriceCents: number;
  originalNetCents: number;
  components: { orderItemID: string; productName: string; quantity: number; requiredQuantity: number; individualPriceCents: number }[];
}

export interface BundleRefundCalculation extends BundleReturnPurchase {
  version: 1;
  method: 'BUNDLE_KEPT_QUANTITY';
  beforeKeptQuantities: Record<string, number>;
  keptQuantities: Record<string, number>;
  beforeInstanceCount: number;
  keptInstanceCount: number;
  keptNetCents: number;
  lostDiscountCents: number;
  cumulativeRefundCents: number;
  previousRefundCents: number;
  refundCents: number;
  allocations: { orderItemID: string; quantity: number; refundCents: number }[];
}

const cents = (n: number) => Number.isSafeInteger(n) && n >= 0;

/** Purchase allocations identify paid cents, not physical units or return
 * entitlement. Consume surplus first and regroup the kept units into the
 * maximum complete recipes. Never consult live prices or volume rules.
 * Like ordinary kept-quantity refunds, earlier CALCULATED refunds remain
 * history even if an admin paid a different amount. Actual payouts have
 * separate group and collection caps checked under the order lock. */
export function calculateBundleRefund(
  purchase: BundleReturnPurchase,
  previouslyReturned: Record<string, number>,
  requested: { orderItemID: string; quantity: number }[],
  previousRefundCents: number,
): BundleRefundCalculation {
  const { components, instanceCount, flatPriceCents, originalNetCents } = purchase;
  const invalid = () => { throw new AppError('CONFLICT', 'Bundle purchase or return history does not reconcile'); };
  if (components.length < 2 || new Set(components.map(c => c.orderItemID)).size !== components.length
    || !Number.isSafeInteger(instanceCount) || instanceCount < 1 || !cents(flatPriceCents) || flatPriceCents === 0
    || !cents(originalNetCents) || !cents(previousRefundCents) || previousRefundCents > originalNetCents
    || components.some(c => !Number.isSafeInteger(c.quantity) || !Number.isSafeInteger(c.requiredQuantity)
      || c.requiredQuantity < 1 || c.quantity < c.requiredQuantity * instanceCount || !cents(c.individualPriceCents))) invalid();
  const expectedPaid = instanceCount * flatPriceCents + components.reduce((sum, c) =>
    sum + (c.quantity - instanceCount * c.requiredQuantity) * c.individualPriceCents, 0);
  if (!cents(expectedPaid) || expectedPaid !== originalNetCents || !requested.length
    || new Set(requested.map(r => r.orderItemID)).size !== requested.length) invalid();
  const bounds = bundlePriceBounds(components.map(c => ({ quantity: c.requiredQuantity, individualPriceCents: c.individualPriceCents })));
  if (flatPriceCents <= bounds.incompleteCents || flatPriceCents >= bounds.fullCents
    || instanceCount !== Math.min(...components.map(c => Math.floor(c.quantity / c.requiredQuantity)))) invalid();
  const beforeKeptQuantities = Object.fromEntries(components.map(c => [c.orderItemID, c.quantity - (previouslyReturned[c.orderItemID] ?? 0)]));
  if (components.some(c => !Number.isInteger(beforeKeptQuantities[c.orderItemID]) || beforeKeptQuantities[c.orderItemID] < 0
    || beforeKeptQuantities[c.orderItemID] > c.quantity)) invalid();
  const keptQuantities = { ...beforeKeptQuantities };
  for (const r of requested) {
    if (!(r.orderItemID in keptQuantities) || !Number.isInteger(r.quantity) || r.quantity < 1 || r.quantity > keptQuantities[r.orderItemID]) invalid();
    keptQuantities[r.orderItemID] -= r.quantity;
  }
  const count = (kept: Record<string, number>) => Math.min(instanceCount, ...components.map(c => Math.floor(kept[c.orderItemID] / c.requiredQuantity)));
  const cost = (kept: Record<string, number>, instances: number) => instances * flatPriceCents + components.reduce((sum, c) =>
    sum + (kept[c.orderItemID] - instances * c.requiredQuantity) * c.individualPriceCents, 0);
  const beforeInstanceCount = count(beforeKeptQuantities);
  if (previousRefundCents !== Math.max(0, originalNetCents - cost(beforeKeptQuantities, beforeInstanceCount))) invalid();
  const keptInstanceCount = count(keptQuantities);
  const keptNetCents = cost(keptQuantities, keptInstanceCount);
  if (!cents(keptNetCents)) invalid();
  const recipeSeparateCents = components.reduce((sum, c) => sum + c.requiredQuantity * c.individualPriceCents, 0);
  const cumulativeRefundCents = Math.max(0, Math.min(originalNetCents, originalNetCents - keptNetCents));
  const refundCents = Math.max(0, cumulativeRefundCents - previousRefundCents);
  // Per-line amounts are accounting shares of this GROUP entitlement. In a
  // sequential return a share may exceed that line's purchase allocation.
  const allocated = allocateRefundCents(refundCents, requested.map(r => ({ id: r.orderItemID,
    quantity: r.quantity, calculatedCents: r.quantity * components.find(c => c.orderItemID === r.orderItemID)!.individualPriceCents })));
  return { ...purchase, version: 1, method: 'BUNDLE_KEPT_QUANTITY', beforeKeptQuantities, keptQuantities,
    beforeInstanceCount, keptInstanceCount, keptNetCents,
    lostDiscountCents: (instanceCount - keptInstanceCount) * (recipeSeparateCents - flatPriceCents),
    cumulativeRefundCents, previousRefundCents, refundCents,
    allocations: requested.map(r => ({ ...r, refundCents: allocated.find(a => a.id === r.orderItemID)!.cents })) };
}
