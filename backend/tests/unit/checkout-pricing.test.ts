import { describe, expect, it } from 'vitest';
import { applyComboPricing, type ComboPricingLine, type ComboRuleCandidate } from '../../src/lib/combo-pricing';
import { checkoutItemPrices } from '../../src/lib/checkout-pricing';

const line = (lineId: string, quantity: number, individualUnitPrice: number): ComboPricingLine => ({
  lineId, productId: lineId, quantity, individualUnitPrice, categoryPaths: [], collectionIds: [],
});
const combo = (quantity: number, price: number): ComboRuleCandidate => ({
  id: 'combo', nameEn: 'Combo', nameAr: 'Combo', priority: 0, appliesToAll: true,
  productIds: [], directProductIds: [], categoryTargets: [], collections: [], ruleBasedProductCollections: {},
  tiers: [{ minQty: quantity, maxQty: quantity, price }],
});

describe('checkout price snapshots', () => {
  it('prorates a coupon across combo and individual lines, then their units', () => {
    const priced = applyComboPricing([line('a', 2, 12), line('b', 1, 3)], [combo(2, 5)]);
    const items = checkoutItemPrices(priced, 2); // $8 merchandise, $2 coupon
    expect(items.get('a')).toEqual({
      unitPrice: 1.88, lineTotal: 3.75,
      priceBreakdown: { version: 1, beforeCouponLineTotalCents: 500, unitPricesCents: [187, 188] },
    });
    expect(items.get('b')!.lineTotal).toBe(2.25);
    expect(items.get('b')!.priceBreakdown.unitPricesCents).toEqual([225]);
    expect([...items.values()].reduce((sum, item) => sum + item.lineTotal, 0)).toBe(6);
    expect(priced.subtotal).toBe(8);
  });

  it('preserves two combo units and one individual unit on a single variant line', () => {
    const priced = applyComboPricing([line('a', 3, 12)], [combo(2, 5)]);
    const item = checkoutItemPrices(priced, 0).get('a')!;
    expect(item.priceBreakdown.unitPricesCents).toEqual([250, 250, 1200]);
    expect(item.lineTotal).toBe(17);
    expect(item.unitPrice).toBe(5.67); // compatibility display average only
    expect(checkoutItemPrices(priced, 1.7).get('a')!.priceBreakdown.unitPricesCents).toEqual([225, 225, 1080]);
  });

  it('stores 3-for-$5 as exact unit allocations whose full or sequential sum is $5, never $5.01', () => {
    const item = checkoutItemPrices(applyComboPricing([line('a', 3, 12)], [combo(3, 5)]), 0).get('a')!;
    const units = item.priceBreakdown.unitPricesCents;
    expect(units).toEqual([167, 167, 166]);
    expect(units.reduce((sum, cents) => sum + cents, 0)).toBe(500);
    // Data available for a future partial-return consumer; this does not
    // exercise or change the current return endpoint's average-price math.
    expect(units.slice(0, 1).reduce((a, b) => a + b, 0)
      + units.slice(1).reduce((a, b) => a + b, 0)).toBe(500);
    expect(item.lineTotal).toBe(5);
  });

  it('allocates a one-cent coupon deterministically across tied lines without discounting twice', () => {
    const priced = applyComboPricing([line('a', 1, 1), line('b', 1, 1), line('c', 1, 1)], []);
    const items = checkoutItemPrices(priced, 0.01);
    expect([...items.values()].map((item) => item.priceBreakdown.unitPricesCents)).toEqual([[99], [100], [100]]);
  });

  it('handles a fully discounted order and zero-priced units', () => {
    const priced = applyComboPricing([line('a', 2, 1), line('b', 1, 0)], []);
    expect([...checkoutItemPrices(priced, 2).values()].map((item) => item.priceBreakdown.unitPricesCents))
      .toEqual([[0, 0], [0]]);
    expect(checkoutItemPrices(applyComboPricing([line('a', 3, 0)], []), 0).get('a')!.lineTotal).toBe(0);
  });

  it('preserves the weighted combo allocation when a group spans variants', () => {
    const priced = applyComboPricing([line('a', 1, 10), line('b', 1, 4)], [combo(2, 12)]);
    const items = checkoutItemPrices(priced, 3);
    expect(items.get('a')!.priceBreakdown.beforeCouponLineTotalCents).toBe(857);
    expect(items.get('b')!.priceBreakdown.beforeCouponLineTotalCents).toBe(343);
    expect(items.get('a')!.priceBreakdown.unitPricesCents).toEqual([643]);
    expect(items.get('b')!.priceBreakdown.unitPricesCents).toEqual([257]);
  });

  it('conserves every cent across coupon amounts, including free units and rounding ties', () => {
    const priced = applyComboPricing([line('a', 3, 0.03), line('b', 2, 0.07), line('c', 1, 0)], []);
    for (let couponCents = 0; couponCents <= 23; couponCents++) {
      const items = [...checkoutItemPrices(priced, couponCents / 100).values()];
      let paidCents = 0;
      for (const item of items) {
        const unitSum = item.priceBreakdown.unitPricesCents.reduce((sum, cents) => sum + cents, 0);
        expect(unitSum).toBe(Math.round(item.lineTotal * 100));
        expect(item.priceBreakdown.unitPricesCents.every((cents) => Number.isInteger(cents) && cents >= 0)).toBe(true);
        paidCents += unitSum;
      }
      expect(paidCents).toBe(23 - couponCents);
    }
  });
});
