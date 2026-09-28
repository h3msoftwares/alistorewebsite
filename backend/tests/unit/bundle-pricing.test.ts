import { describe, expect, it } from 'vitest';
import { bundlePriceBounds, priceMerchandise, type BundleCandidate, type BundlePricingLine } from '../../src/lib/bundle-pricing';
import { checkoutItemPrices } from '../../src/lib/checkout-pricing';
import type { ComboRuleCandidate } from '../../src/lib/combo-pricing';

const bundle: BundleCandidate = { id: 'bundle', nameEn: 'Bundle', nameAr: 'باقة', priceCents: 8000, components: [{ variantID: 'a', quantity: 2 }, { variantID: 'b', quantity: 1 }] };
const lines = (a: number, b: number): BundlePricingLine[] => [
  { lineId: 'line-a', variantID: 'a', productId: 'product-a', quantity: a, individualUnitPrice: 30, categoryPaths: [], collectionIds: [] },
  ...(b ? [{ lineId: 'line-b', variantID: 'b', productId: 'product-b', quantity: b, individualUnitPrice: 40, categoryPaths: [], collectionIds: [] }] : []),
];
const volume = (price: number, product = 'product-a'): ComboRuleCandidate => ({ id: 'volume', nameEn: 'Volume', nameAr: 'كمية', priority: 0,
  appliesToAll: false, directProductIds: [product], productIds: [product], categoryTargets: [], collections: [], ruleBasedProductCollections: {}, tiers: [{ minQty: 2, price }] });

describe('fixed recipe Bundle pricing', () => {
  it.each([[2, 0, 0, 60], [1, 1, 0, 70], [2, 1, 1, 80], [3, 1, 1, 110], [4, 2, 2, 160], [5, 3, 2, 230]])(
    '%i A and %i B apply %i instances and total %i', (a, b, instances, subtotal) => {
      const priced = priceMerchandise(lines(a, b), [], [bundle]);
      expect(priced.appliedBundles[0]?.instanceCount ?? 0).toBe(instances);
      expect(priced.subtotal).toBe(subtotal);
    },
  );
  it('ordinary volume pricing wins when cheaper, and on ties', () => {
    for (const rate of [19, 20]) {
      const priced = priceMerchandise(lines(2, 1), [volume(rate)], [bundle]);
      expect(priced.subtotal).toBe(2 * rate + 40);
      expect(priced.appliedBundles).toEqual([]);
      expect(priced.lineComboRuleIds.get('line-a')).toBe('volume');
    }
  });
  it('winning Bundle disables volume for its surplus but keeps other products independent', () => {
    const cart = [...lines(3, 1), { ...lines(2, 0)[0], lineId: 'line-c', variantID: 'c', productId: 'product-c', individualUnitPrice: 30 }];
    const priced = priceMerchandise(cart, [volume(25), volume(25, 'product-c')], [bundle]);
    expect(priced.subtotal).toBe(160); // 80 bundle + 30 surplus + 2*25 other product
    expect(priced.lineUnitPricesCents.get('line-a')).toEqual([2400, 2400, 3000]);
    expect(priced.lineComboRuleIds.get('line-a')).toBeNull();
    expect(priced.lineComboRuleIds.get('line-c')).toBe('volume');
  });
  it('rechecks bounds after individual prices change', () => {
    const sale = lines(2, 1).map((line) => ({ ...line, individualUnitPrice: line.variantID === 'a' ? 20 : 30 }));
    expect(priceMerchandise(sale, [], [bundle]).subtotal).toBe(70);
    const raised = lines(2, 1).map((line) => ({ ...line, individualUnitPrice: line.variantID === 'a' ? 40 : 50 }));
    expect(priceMerchandise(raised, [], [bundle]).appliedBundles).toEqual([]);
    expect(bundlePriceBounds([{ quantity: 2, individualPriceCents: 3000 }, { quantity: 1, individualPriceCents: 4000 }])).toEqual({ fullCents: 10000, incompleteCents: 7000 });
  });
  it('coupon mode uses ordinary pricing and never creates bundle allocations', () => {
    const priced = priceMerchandise(lines(2, 1), [], [bundle], false);
    expect(priced.subtotal).toBe(100);
    expect(priced.appliedBundles).toEqual([]);
    expect([...checkoutItemPrices(priced, 10).values()].reduce((sum, line) => sum + line.lineTotal, 0)).toBe(90);
    expect(() => checkoutItemPrices(priceMerchandise(lines(2, 1), [], [bundle]), 1)).toThrow('mutually exclusive');
  });
  it('snapshots exact cents, instance identity and surplus, independent of cart row order', () => {
    const priced = priceMerchandise(lines(5, 3), [], [{ ...bundle, priceCents: 8001 }]);
    const reverse = priceMerchandise(lines(5, 3).reverse(), [], [{ ...bundle, priceCents: 8001 }]);
    expect(priced.lineUnitPricesCents.get('line-a')).toEqual(reverse.lineUnitPricesCents.get('line-a'));
    const snapshots = checkoutItemPrices(priced, 0);
    expect(snapshots.get('line-a')!.priceBreakdown).toMatchObject({ version: 3, pricingModel: 'BUNDLE', units: [
      { kind: 'BUNDLE', instance: 0 }, { kind: 'BUNDLE', instance: 0 }, { kind: 'BUNDLE', instance: 1 }, { kind: 'BUNDLE', instance: 1 }, { kind: 'SURPLUS' },
    ] });
    expect([...snapshots.values()].reduce((sum, line) => sum + Math.round(line.lineTotal * 100), 0)).toBe(23002);
    for (const line of snapshots.values()) expect(line.priceBreakdown.unitPricesCents.reduce((sum, cents) => sum + cents, 0)).toBe(Math.round(line.lineTotal * 100));
  });
});
