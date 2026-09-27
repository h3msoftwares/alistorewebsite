import { describe, expect, it } from 'vitest';
import { applyComboPricing, type ComboPricingLine, type ComboRuleCandidate } from '../../src/lib/combo-pricing';
import { checkoutItemPrices } from '../../src/lib/checkout-pricing';

const line = (lineId: string, quantity: number, individualUnitPrice: number): ComboPricingLine => ({
  lineId, productId: lineId, quantity, individualUnitPrice, categoryPaths: [], collectionIds: [],
});
const rule: ComboRuleCandidate = {
  id: 'volume', nameEn: 'Volume', nameAr: 'Volume', priority: 0, appliesToAll: false,
  productIds: ['a'], directProductIds: ['a'], categoryTargets: [], collections: [], ruleBasedProductCollections: {},
  tiers: [{ minQty: 3, price: 10 }],
};

describe('checkout snapshots after volume pricing', () => {
  it('prorates a coupon across volume-priced and individually priced lines', () => {
    const priced = applyComboPricing([line('a', 3, 12), line('b', 1, 20)], [rule]);
    const items = checkoutItemPrices(priced, 5);
    expect(priced.subtotal).toBe(50);
    expect(items.get('a')).toMatchObject({
      unitPrice: 9, lineTotal: 27,
      priceBreakdown: { version: 2, beforeCouponLineTotalCents: 3000, couponDiscountCents: 300,
        netLineTotalCents: 2700, individualUnitPriceCents: 1200, quantity: 3,
        rule: { id: 'volume' }, tiers: [{ minQty: 3, unitPriceCents: 1000 }], unitPricesCents: [900, 900, 900] },
    });
    expect(items.get('b')!.lineTotal).toBe(18);
  });
  it('allocates every cent for three $1.67 units less a one-cent coupon', () => {
    const item = checkoutItemPrices(applyComboPricing([line('a', 3, 1.67)], []), 0.01).get('a')!;
    expect(item.priceBreakdown.unitPricesCents).toEqual([166, 167, 167]);
    expect(item.priceBreakdown.unitPricesCents.reduce((a, b) => a + b, 0)).toBe(500);
    expect(item.lineTotal).toBe(5);
  });
  it('allocates a one-cent coupon deterministically across tied lines', () => {
    const priced = applyComboPricing([line('a', 1, 1), line('b', 1, 1), line('c', 1, 1)], []);
    expect([...checkoutItemPrices(priced, 0.01).values()].map((item) => item.priceBreakdown.unitPricesCents)).toEqual([[99], [100], [100]]);
  });
  it('handles full discounts and zero-priced units', () => {
    const priced = applyComboPricing([line('a', 2, 1), line('b', 1, 0)], []);
    expect([...checkoutItemPrices(priced, 2).values()].map((item) => item.priceBreakdown.unitPricesCents)).toEqual([[0, 0], [0]]);
  });
  it('conserves every cent across all coupon amounts in a small cart', () => {
    const priced = applyComboPricing([line('a', 3, 0.03), line('b', 2, 0.07), line('c', 1, 0)], []);
    for (let discount = 0; discount <= 23; discount++) {
      const items = [...checkoutItemPrices(priced, discount / 100).values()];
      expect(items.flatMap((item) => item.priceBreakdown.unitPricesCents).reduce((a, b) => a + b, 0)).toBe(23 - discount);
      expect(items.every((item) => item.priceBreakdown.unitPricesCents.every((n) => n >= 0 && Number.isInteger(n)))).toBe(true);
    }
  });
});
