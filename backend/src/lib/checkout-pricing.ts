import type { ComboPricingResult } from './combo-pricing';
import { allocateCents } from './allocate-cents';
import { round2 } from './money';
import type { PurchasePricingSnapshot } from './return-pricing';

/** Versioned checkout snapshot. Unit array indexes are stable allocation
 * positions, not physical item identifiers. Null on legacy OrderItems. */
export type OrderItemPriceBreakdown = PurchasePricingSnapshot;

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
      priceBreakdown: {
        ...priced.linePricingBasis.get(lineId)!, version: 2,
        beforeCouponLineTotalCents: lineCents[index], couponDiscountCents: discounts[index],
        netLineTotalCents: lineCents[index] - discounts[index], unitPricesCents,
      },
    }];
  }));
}
