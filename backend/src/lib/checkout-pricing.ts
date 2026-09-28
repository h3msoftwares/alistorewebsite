import type { ComboPricingResult } from './combo-pricing';
import { allocateCents } from './allocate-cents';
import { round2 } from './money';
import type { PurchasePricingSnapshot } from './return-pricing';
import type { BundlePricingResult, BundleUnit } from './bundle-pricing';

/** Versioned checkout snapshot. Unit array indexes are stable allocation
 * positions, not physical item identifiers. Null on legacy OrderItems. */
export type BundlePurchasePricingSnapshot = {
  version: 3; pricingModel: 'BUNDLE'; bundleID: string; quantity: number;
  individualUnitPriceCents: number; beforeCouponLineTotalCents: number;
  couponDiscountCents: 0; netLineTotalCents: number; unitPricesCents: number[]; units: BundleUnit[];
};
export type OrderItemPriceBreakdown = PurchasePricingSnapshot | BundlePurchasePricingSnapshot;

type ItemPrices = {
  unitPrice: number;
  lineTotal: number;
  priceBreakdown: OrderItemPriceBreakdown;
};

/** Snapshot the net merchandise prices without changing the order's pre-
 * coupon subtotal, coupon amount, delivery calculation, or amount due.
 * Allocate the coupon to lines first, then to the actual combo/individual
 * units within each line. All remainders are assigned in integer cents. */
export function checkoutItemPrices(priced: ComboPricingResult, discountAmount: number): Map<string, ItemPrices> {
  const lines = [...priced.lineUnitPricesCents];
  const lineCents = lines.map(([, units]) => units.reduce((sum, cents) => sum + cents, 0));
  const subtotalCents = lineCents.reduce((sum, cents) => sum + cents, 0);
  if (subtotalCents !== Math.round(round2(priced.subtotal) * 100)) {
    throw new Error('Unit allocations do not reconcile with merchandise subtotal');
  }
  const discountCents = Math.round(round2(discountAmount) * 100);
  if (discountCents < 0 || discountCents > subtotalCents) throw new Error('Coupon exceeds merchandise amount');
  const bundlePricing = 'appliedBundles' in priced ? priced as BundlePricingResult : null;
  if (bundlePricing?.appliedBundles.length && discountCents) throw new Error('Bundles and coupons are mutually exclusive');
  const discounts = allocateCents(discountCents, lineCents);
  return new Map(lines.map(([lineId, units], index) => {
    const unitDiscounts = allocateCents(discounts[index], units);
    const unitPricesCents = units.map((cents, unit) => cents - unitDiscounts[unit]);
    const lineTotal = (lineCents[index] - discounts[index]) / 100;
    return [lineId, {
      // Compatibility/display average only: never multiply this rounded
      // value to reconstruct a partial or full line's exact paid amount.
      unitPrice: round2(lineTotal / units.length),
      lineTotal,
      priceBreakdown: bundlePricing?.bundleUnits.has(lineId) ? {
        version: 3, pricingModel: 'BUNDLE', bundleID: bundlePricing.bundleUnits.get(lineId)![0].bundleID,
        quantity: units.length, individualUnitPriceCents: priced.linePricingBasis.get(lineId)!.individualUnitPriceCents,
        beforeCouponLineTotalCents: lineCents[index], couponDiscountCents: 0,
        netLineTotalCents: lineCents[index], unitPricesCents, units: bundlePricing.bundleUnits.get(lineId)!,
      } : {
        ...priced.linePricingBasis.get(lineId)!, version: 2,
        beforeCouponLineTotalCents: lineCents[index], couponDiscountCents: discounts[index],
        netLineTotalCents: lineCents[index] - discounts[index], unitPricesCents,
      },
    }];
  }));
}
