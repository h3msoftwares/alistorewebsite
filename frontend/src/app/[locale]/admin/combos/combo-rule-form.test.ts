import { describe, expect, it } from 'vitest';
import { blankComboRuleValues, comboRuleBodyFromValues, comboRuleSchema } from './combo-rule-form';

const values = {
  ...blankComboRuleValues,
  nameEn: 'Combo',
  nameAr: 'عرض',
  appliesToAll: true,
};

describe('automatic combo tier bounds', () => {
  it('uses quantity order even when rows are entered out of order', () => {
    const form = {
      ...values,
      tiers: [
        { minQty: 8, maxQty: '', price: 10 },
        { minQty: 3, maxQty: '', price: 5 },
        { minQty: 5, maxQty: '', price: 7 },
      ],
    };
    expect(comboRuleSchema.safeParse(form).success).toBe(true);
    expect(comboRuleBodyFromValues(form).tiers).toEqual([
      { minQty: 8, maxQty: null, price: 10 },
      { minQty: 3, maxQty: 4, price: 5 },
      { minQty: 5, maxQty: 7, price: 7 },
    ]);
    expect(form.tiers.every((tier) => tier.maxQty === '')).toBe(true);
  });

  it('preserves explicit bounds, including gaps and a finite last maximum', () => {
    const form = {
      ...values,
      tiers: [
        { minQty: 3, maxQty: '3', price: 5 },
        { minQty: 5, maxQty: '9', price: 7 },
      ],
    };
    expect(comboRuleSchema.safeParse(form).success).toBe(true);
    expect(comboRuleBodyFromValues(form).tiers.map((tier) => tier.maxQty)).toEqual([3, 9]);
  });

  it('rejects duplicate minimums even when both maximums are automatic', () => {
    const result = comboRuleSchema.safeParse({
      ...values,
      tiers: [
        { minQty: 3, maxQty: '', price: 5 },
        { minQty: 3, maxQty: '', price: 7 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['tiers'], message: 'Tiers must not have overlapping quantity ranges',
      }));
    }
  });

  it('keeps a single automatic tier open-ended', () => {
    expect(comboRuleBodyFromValues({
      ...values, tiers: [{ minQty: 3, maxQty: '', price: 5 }],
    }).tiers).toEqual([{ minQty: 3, maxQty: null, price: 5 }]);
  });
});
