import { describe, expect, it } from 'vitest';
import { applyComboPricing, deriveComboTiers, pickComboRule, volumeBandBoundaries, type ComboPricingLine, type ComboRuleCandidate } from '../../src/lib/combo-pricing';

function rule(over: Partial<ComboRuleCandidate> = {}): ComboRuleCandidate {
  return { id: 'rule', nameEn: 'Volume', nameAr: 'Volume', priority: 0, appliesToAll: false,
    productIds: ['product'], directProductIds: ['product'], categoryTargets: [], collections: [],
    ruleBasedProductCollections: {}, tiers: [{ minQty: 3, price: 10 }, { minQty: 5, price: 8.1 }], ...over };
}
function line(quantity: number, over: Partial<ComboPricingLine> = {}): ComboPricingLine {
  return { lineId: 'line', productId: 'product', categoryPaths: [], collectionIds: [], individualUnitPrice: 12, quantity, ...over };
}

describe('volume rate bands', () => {
  it.each([[1, 12], [2, 24], [3, 30], [4, 40], [5, 40.5], [7, 56.7], [300, 2430], [301, 2438.1], [5000, 40500]])(
    'charges %i units as one whole-quantity band total of %s', (quantity, expected) => {
      const priced = applyComboPricing([line(quantity)], [rule()]);
      expect(priced.subtotal).toBe(expected);
      expect(priced.lineTotals.get('line')).toBe(expected);
      expect(priced.lineUnitPricesCents.get('line')).toHaveLength(quantity);
      expect(priced.lineUnitPricesCents.get('line')!.reduce((a, b) => a + b, 0)).toBe(Math.round(expected * 100));
    });
  it('derives all upper bounds from sorted minimums', () => {
    expect(deriveComboTiers([{ minQty: 5, price: 8.1 }, { minQty: 3, price: 10 }])).toEqual([
      { minQty: 3, maxQty: 4, price: 10 }, { minQty: 5, maxQty: null, price: 8.1 },
    ]);
  });
  it('does not group leftovers or pool two variants of the same product', () => {
    const priced = applyComboPricing([line(2, { lineId: 'small' }), line(2, { lineId: 'large' })], [rule()]);
    expect(priced.subtotal).toBe(48);
    expect([...priced.lineTotals.values()]).toEqual([24, 24]);
  });
  it('compares a cheaper promotion price without stacking the rate', () => {
    const priced = applyComboPricing([line(7, { individualUnitPrice: 7 })], [rule()]);
    expect(priced.subtotal).toBe(49);
    expect(priced.comboSavings).toBe(0);
    expect(priced.lineComboRuleIds.get('line')).toBeNull();
  });
  it('preserves individual pricing without a matching rule', () => {
    expect(applyComboPricing([line(3, { individualUnitPrice: 19.99 })], []).subtotal).toBe(59.97);
  });
  it('uses priority instead of combining competing volume rules', () => {
    const higher = rule({ id: 'high', priority: 5, tiers: [{ minQty: 3, price: 11 }] });
    expect(applyComboPricing([line(3)], [rule(), higher]).subtotal).toBe(33);
  });
  it('cannot apply category, collection, site-wide, or multi-product targeting', () => {
    for (const over of [
      { appliesToAll: true }, { directProductIds: ['product', 'other'] },
      { categoryTargets: [{ path: '/clothes/', includeDescendants: true, nameEn: 'C', nameAr: 'C' }] },
      { collections: [{ id: 'collection', nameEn: 'C', nameAr: 'C' }] },
    ]) {
      expect(pickComboRule({ id: 'product', categoryPaths: ['/clothes/'], collectionIds: ['collection'] }, [rule(over)])).toBeNull();
    }
  });
});

describe('strict total increase at thresholds', () => {
  it.each([8, 7.9])('flags equal or decreasing total for the 5+ rate %s', (rate) => {
    const boundaries = volumeBandBoundaries([{ minQty: 3, price: 10 }, { minQty: 5, price: rate }], 12);
    expect(boundaries[0].valid).toBe(true);
    expect(boundaries[1]).toMatchObject({ beforeQuantity: 4, afterQuantity: 5, beforeTotalCents: 4000, afterTotalCents: Math.round(rate * 500), valid: false });
  });
  it('checks the first discounted band against the individual price', () => {
    expect(volumeBandBoundaries([{ minQty: 3, price: 5 }], 12)[0]).toMatchObject({ beforeTotalCents: 2400, afterTotalCents: 1500, valid: false });
  });
  it('accepts strictly increasing totals using exact cents', () => {
    expect(volumeBandBoundaries(rule().tiers, 12).every((b) => b.valid)).toBe(true);
    expect(volumeBandBoundaries([{ minQty: 2, price: 0.51 }], 1)[0].valid).toBe(true);
    expect(volumeBandBoundaries([{ minQty: 2, price: 0.5 }], 1)[0].valid).toBe(false);
  });
});
