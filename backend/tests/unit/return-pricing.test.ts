import { describe, it, expect } from 'vitest';
import { applyComboPricing, type ComboRuleCandidate } from '../../src/lib/combo-pricing';
import { checkoutItemPrices } from '../../src/lib/checkout-pricing';
import { calculateKeptRefund, readPurchasePricing } from '../../src/lib/return-pricing';

const rule: ComboRuleCandidate = { id: 'rule', nameEn: 'Volume', nameAr: 'Volume', priority: 1,
  appliesToAll: false, productIds: ['p'], directProductIds: ['p'], categoryTargets: [], collections: [],
  tiers: [{ minQty: 3, price: 10 }, { minQty: 5, price: 8 }], ruleBasedProductCollections: {} };
function snapshot(quantity = 7, coupon = 0, individualUnitPrice = 12) {
  const priced = applyComboPricing([{ lineId: 'line', productId: 'p', quantity, individualUnitPrice,
    categoryPaths: [], collectionIds: [] }], [rule]);
  return checkoutItemPrices(priced, coupon).get('line')!.priceBreakdown;
}

describe('kept-quantity refunds from purchase snapshots', () => {
  it.each([[3, 4, 4000, 1600], [5, 2, 2400, 3200]])('7 at $8, return %i', (returned, kept, keptCents, refund) => {
    expect(calculateKeptRefund(snapshot(), returned, 0)).toMatchObject({
      originalNetCents: 5600, keptQuantity: kept, keptNetCents: keptCents, refundCents: refund,
    });
  });
  it('subtracts previously issued refunds from cumulative entitlement', () => {
    const s = snapshot();
    const a = calculateKeptRefund(s, 3, 0).refundCents;
    const b = calculateKeptRefund(s, 5, a).refundCents;
    const c = calculateKeptRefund(s, 7, a + b).refundCents;
    expect([a, b, c]).toEqual([1600, 1600, 2400]);
    expect(a + b + c).toBe(5600);
  });
  it('allows a zero-refund boundary and clamps negative entitlement', () => {
    expect(calculateKeptRefund(snapshot(5), 1, 0).refundCents).toBe(0);
    const s = snapshot(5);
    s.tiers = [{ minQty: 5, unitPriceCents: 800 }];
    expect(calculateKeptRefund(s, 1, 0).refundCents).toBe(0); // kept 4 * $12 > $40 paid
    expect(calculateKeptRefund(s, 5, 0).refundCents).toBe(4000);
  });
  it('preserves the individual sale/promotion comparison and applies coupons once', () => {
    expect(calculateKeptRefund(snapshot(7, 5.6), 3, 0)).toMatchObject({ originalNetCents: 5040, keptNetCents: 3600, refundCents: 1440 });
    // A $9 purchase-time promotion beats the $10 band for the four kept units.
    expect(calculateKeptRefund(snapshot(7, 0, 9), 3, 0)).toMatchObject({ keptNetCents: 3600, refundCents: 2000 });
  });
  it('preserves the exact allocated coupon fraction across every return sequence', () => {
    const s = snapshot(7, 0.01);
    for (let first = 1; first < 7; first++) {
      let issued = calculateKeptRefund(s, first, 0).refundCents;
      for (let totalReturned = first + 1; totalReturned <= 7; totalReturned++) {
        const amount = calculateKeptRefund(s, totalReturned, issued).refundCents;
        expect(Number.isInteger(amount)).toBe(true);
        expect(amount).toBeGreaterThanOrEqual(0);
        issued += amount;
        expect(issued).toBeLessThanOrEqual(5599);
      }
      expect(issued).toBe(5599);
    }
  });
  it('recognizes historical snapshots without treating them as rate bands', () => {
    expect(readPurchasePricing(null)).toBeNull();
    expect(readPurchasePricing({ version: 1, unitPricesCents: [166, 167, 167], beforeCouponLineTotalCents: 500 })).toBeNull();
    expect(readPurchasePricing(snapshot())).toEqual(snapshot());
    expect(() => readPurchasePricing({ ...snapshot(), netLineTotalCents: 99 })).toThrow();
  });
});
