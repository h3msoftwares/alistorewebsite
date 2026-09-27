import { z } from 'zod';

const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const purchasePricingSchema = z.object({
  version: z.literal(2),
  pricingModel: z.literal('UNIT_RATE_BANDS'),
  quantity: z.number().int().positive(),
  individualUnitPriceCents: cents,
  tiers: z.array(z.object({ minQty: z.number().int().positive(), unitPriceCents: cents })),
  rule: z.object({ id: z.string(), nameEn: z.string(), nameAr: z.string(), priority: z.number().int() }).nullable(),
  beforeCouponLineTotalCents: cents,
  couponDiscountCents: cents,
  netLineTotalCents: cents,
  unitPricesCents: z.array(cents),
});
export type PurchasePricingSnapshot = z.infer<typeof purchasePricingSchema>;

/** Exact round-half-up of a nonnegative rational amount. */
export function prorateCents(amount: number, numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const d = BigInt(denominator);
  return Number((BigInt(amount) * BigInt(numerator) * 2n + d) / (2n * d));
}

export function moneyCents(value: { toString(): string } | number): number {
  const [whole, fraction = ''] = value.toString().split('.');
  return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)));
}

export function readPurchasePricing(value: unknown): PurchasePricingSnapshot | null {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 2) return null;
  const s = purchasePricingSchema.parse(value);
  if (s.couponDiscountCents + s.netLineTotalCents !== s.beforeCouponLineTotalCents
    || s.unitPricesCents.length !== s.quantity
    || s.unitPricesCents.reduce((a, b) => a + b, 0) !== s.netLineTotalCents) {
    throw new Error('Invalid purchase pricing snapshot');
  }
  return s;
}

export type RefundCalculation = {
  version: 1;
  method: 'KEPT_QUANTITY' | 'LEGACY_UNIT_PRICE';
  originalQuantity: number;
  returnedQuantity: number;
  keptQuantity: number;
  originalNetCents: number;
  keptGrossCents: number;
  keptNetCents: number;
  couponDiscountCents: number;
  couponBasisCents: number;
  proportionalRefundCents: number;
  quantityDiscountAdjustmentCents: number;
  cumulativeRefundCents: number;
  previousRefundCents: number;
  reservedRefundCents: number;
  refundCents: number;
};

/** Uses only immutable checkout data. Prior refunds are deducted from the
 * cumulative entitlement, so all return sequences reconcile to the paid line. */
export function calculateKeptRefund(s: PurchasePricingSnapshot, returnedQuantity: number, previousRefundCents: number, reservedRefundCents = 0): RefundCalculation {
  if (!Number.isInteger(returnedQuantity) || returnedQuantity < 0 || returnedQuantity > s.quantity) {
    throw new Error('Invalid returned quantity');
  }
  const keptQuantity = s.quantity - returnedQuantity;
  const band = [...s.tiers].sort((a, b) => b.minQty - a.minQty).find((t) => keptQuantity >= t.minQty);
  const keptRate = Math.min(s.individualUnitPriceCents, band?.unitPriceCents ?? s.individualUnitPriceCents);
  const keptGrossCents = keptQuantity * keptRate;
  // The coupon basis is the actual line allocation, not a rounded percentage.
  // Apply its retained fraction once. A full return always leaves zero cents.
  const keptNetCents = prorateCents(keptGrossCents, s.netLineTotalCents, s.beforeCouponLineTotalCents);
  const cumulativeRefundCents = Math.max(0, Math.min(s.netLineTotalCents, s.netLineTotalCents - keptNetCents));
  const accountedCents = previousRefundCents + reservedRefundCents;
  const refundCents = Math.max(0, Math.min(s.netLineTotalCents - accountedCents, cumulativeRefundCents - accountedCents));
  const proportionalRefundCents = prorateCents(s.netLineTotalCents, returnedQuantity, s.quantity);
  return { version: 1, method: 'KEPT_QUANTITY', originalQuantity: s.quantity, returnedQuantity, keptQuantity,
    originalNetCents: s.netLineTotalCents, keptGrossCents, keptNetCents,
    couponDiscountCents: s.couponDiscountCents, couponBasisCents: s.beforeCouponLineTotalCents,
    proportionalRefundCents, quantityDiscountAdjustmentCents: proportionalRefundCents - cumulativeRefundCents,
    cumulativeRefundCents, previousRefundCents, reservedRefundCents, refundCents };
}
