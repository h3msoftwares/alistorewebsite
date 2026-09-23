import { describe, it, expect } from 'vitest';
import {
  applyComboPricing,
  pickComboRule,
  MAX_COMBO_DP_UNITS,
  type ComboRuleCandidate,
  type ComboPricingLine,
} from '../../src/lib/combo-pricing';

function rule(over: Partial<ComboRuleCandidate> = {}): ComboRuleCandidate {
  return {
    id: 'rule-1',
    nameEn: 'Test combo',
    nameAr: 'اختبار',
    priority: 0,
    appliesToAll: false,
    productIds: [],
    directProductIds: [],
    categoryTargets: [],
    collections: [],
    ruleBasedProductCollections: {},
    tiers: [],
    ...over,
  };
}

function line(over: Partial<ComboPricingLine> & { lineId: string }): ComboPricingLine {
  return {
    productId: 'prod-1',
    categoryPaths: [],
    collectionIds: [],
    quantity: 1,
    individualUnitPrice: 10,
    ...over,
  };
}

const product = { id: 'prod-1', categoryPaths: [] as string[], collectionIds: [] as string[] };

describe('pickComboRule', () => {
  it('returns null when no rule covers the product', () => {
    expect(pickComboRule(product, [rule({ productIds: ['other'], directProductIds: ['other'] })])).toBeNull();
  });

  it('picks the single highest-priority rule covering the product', () => {
    const low = rule({ id: 'low', appliesToAll: true, priority: 0 });
    const high = rule({ id: 'high', appliesToAll: true, priority: 5 });
    expect(pickComboRule(product, [low, high])?.id).toBe('high');
  });
});

describe('applyComboPricing — no active combo rules (regression guarantee)', () => {
  it('produces byte-identical totals to plain individual pricing', () => {
    const lines = [
      line({ lineId: 'a', individualUnitPrice: 19.99, quantity: 3 }),
      line({ lineId: 'b', individualUnitPrice: 5, quantity: 2 }),
    ];
    const result = applyComboPricing(lines, []);
    expect(result.lineTotals.get('a')).toBe(59.97);
    expect(result.lineTotals.get('b')).toBe(10);
    expect(result.subtotal).toBe(69.97);
    expect(result.comboSavings).toBe(0);
    expect(result.lineComboRuleIds.get('a')).toBeNull();
  });
});

describe('applyComboPricing — exact multiple of a tier', () => {
  it('prices 4 eligible units as two "2 for $5" groups', () => {
    const r = rule({ appliesToAll: true, tiers: [{ minQty: 2, maxQty: 2, price: 5 }] });
    const lines = [line({ lineId: 'a', individualUnitPrice: 3.5, quantity: 4 })];
    const result = applyComboPricing(lines, [r]);
    expect(result.subtotal).toBe(10); // 2 x $5
    expect(result.lineTotals.get('a')).toBe(10);
    expect(result.comboSavings).toBeCloseTo(4, 5); // 4 x $3.50 = $14 individually
  });
});

describe('applyComboPricing — remainder (Q2 example: 3 eligible items, "2-for-$5")', () => {
  it('groups 2 and leaves 1 priced individually, taking the cheaper of the two outcomes', () => {
    const r = rule({ appliesToAll: true, tiers: [{ minQty: 2, maxQty: 2, price: 5 }] });
    const lines = [line({ lineId: 'a', individualUnitPrice: 3, quantity: 3 })];
    const result = applyComboPricing(lines, [r]);
    // Grouping 2 of the 3 ($3 each, $9 individually) into the $5 tier: $5 + $3 leftover = $8.
    // Grouping nothing: 3 x $3 = $9. $8 < $9, so the combo applies to exactly 2 units.
    expect(result.subtotal).toBe(8);
  });
});

describe('applyComboPricing — multi-tier optimum (the greedy-failure case from the design plan)', () => {
  it('picks two 3-for-$7 groups ($14) over three 2-for-$5 groups ($15) for 6 units', () => {
    const r = rule({
      appliesToAll: true,
      tiers: [
        { minQty: 2, maxQty: 2, price: 5 },
        { minQty: 3, maxQty: 3, price: 7 },
      ],
    });
    const lines = [line({ lineId: 'a', individualUnitPrice: 100, quantity: 6 })]; // individual price high enough that grouping always wins
    const result = applyComboPricing(lines, [r]);
    expect(result.subtotal).toBe(14);
  });
});

describe('applyComboPricing — best price wins against individual sale/promotion pricing', () => {
  it('leaves every unit individually priced when the individual price already beats every tier', () => {
    const r = rule({ appliesToAll: true, tiers: [{ minQty: 2, maxQty: 2, price: 5 }] }); // $2.50/unit
    const lines = [line({ lineId: 'a', individualUnitPrice: 2, quantity: 4 })]; // already $2/unit — cheaper than the tier
    const result = applyComboPricing(lines, [r]);
    expect(result.subtotal).toBe(8); // 4 x $2, combo never applied
    expect(result.comboSavings).toBe(0);
  });

  it('a size-1 tier still loses to a cheaper individual (sale) price', () => {
    const r = rule({ appliesToAll: true, tiers: [{ minQty: 1, maxQty: 1, price: 2 }] });
    const lines = [line({ lineId: 'a', individualUnitPrice: 1.8, quantity: 1 })];
    const result = applyComboPricing(lines, [r]);
    expect(result.subtotal).toBe(1.8);
  });
});

describe('applyComboPricing — cross-product grouping and proportional allocation', () => {
  it('pools units across two different lines under the same rule and allocates the group price by each unit\'s own value', () => {
    const r = rule({ appliesToAll: true, tiers: [{ minQty: 2, maxQty: 2, price: 12 }] });
    const lines = [
      line({ lineId: 'expensive', productId: 'p1', individualUnitPrice: 10, quantity: 1 }),
      line({ lineId: 'cheap', productId: 'p2', individualUnitPrice: 4, quantity: 1 }),
    ];
    const result = applyComboPricing(lines, [r]);
    expect(result.subtotal).toBe(12);
    // Allocated proportionally: 10/14 and 4/14 of $12 = $8.57 and $3.43 (reconciled to the cent).
    const expensiveShare = result.lineTotals.get('expensive')!;
    const cheapShare = result.lineTotals.get('cheap')!;
    expect(round2SumsExactly(expensiveShare, cheapShare, 12)).toBe(true);
    expect(expensiveShare).toBeGreaterThan(cheapShare);
    expect(expensiveShare).toBeCloseTo(8.57, 2);
    expect(cheapShare).toBeCloseTo(3.43, 2);
  });

  it('reconciles rounding across many members so the group total is exact to the cent', () => {
    const r = rule({ appliesToAll: true, tiers: [{ minQty: 3, maxQty: 3, price: 10 }] });
    // Three units whose proportional shares don't divide evenly in cents.
    const lines = [
      line({ lineId: 'a', productId: 'p1', individualUnitPrice: 3.33, quantity: 1 }),
      line({ lineId: 'b', productId: 'p2', individualUnitPrice: 3.33, quantity: 1 }),
      line({ lineId: 'c', productId: 'p3', individualUnitPrice: 3.34, quantity: 1 }),
    ];
    const result = applyComboPricing(lines, [r]);
    const sum = result.lineTotals.get('a')! + result.lineTotals.get('b')! + result.lineTotals.get('c')!;
    expect(Math.round(sum * 100) / 100).toBe(10);
  });
});

describe('applyComboPricing — priority attribution keeps two rules from double-covering one product', () => {
  it('a product covered by two active rules is priced only under the higher-priority one', () => {
    const cheapCombo = rule({ id: 'low', appliesToAll: true, priority: 0, tiers: [{ minQty: 2, maxQty: 2, price: 9 }] });
    const betterCombo = rule({ id: 'high', appliesToAll: true, priority: 1, tiers: [{ minQty: 2, maxQty: 2, price: 5 }] });
    const lines = [line({ lineId: 'a', individualUnitPrice: 4, quantity: 2 })];
    const result = applyComboPricing(lines, [cheapCombo, betterCombo]);
    expect(result.subtotal).toBe(5);
    expect(result.lineComboRuleIds.get('a')).toBe('high');
  });
});

describe('applyComboPricing — defensive DP cap', () => {
  it('still returns a valid, non-worse-than-individual total when the pool exceeds MAX_COMBO_DP_UNITS', () => {
    const r = rule({ appliesToAll: true, tiers: [{ minQty: 2, maxQty: 2, price: 5 }] });
    const n = MAX_COMBO_DP_UNITS + 10;
    const lines = [line({ lineId: 'a', individualUnitPrice: 3, quantity: n })];
    const result = applyComboPricing(lines, [r]);
    expect(result.subtotal).toBeLessThanOrEqual(round2Times(3, n));
    expect(result.subtotal).toBeGreaterThan(0);
  });
});

function round2SumsExactly(a: number, b: number, total: number): boolean {
  return Math.round((a + b) * 100) === Math.round(total * 100);
}

function round2Times(price: number, qty: number): number {
  return Math.round(price * qty * 100) / 100;
}
