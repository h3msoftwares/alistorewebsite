import { describe, expect, it } from 'vitest';
import { blankComboRuleValues, comboRuleBodyFromValues, comboRuleSchema } from './combo-rule-form';
const values = { ...blankComboRuleValues, nameEn: 'Volume', nameAr: 'Volume', productIds: ['p1'] };
describe('volume band form', () => {
  it('sorts minima and sends no independently editable maximum', () => {
    const form = { ...values, tiers: [{ minQty: 5, price: 8.1 }, { minQty: 3, price: 10 }] };
    expect(comboRuleSchema.safeParse(form).success).toBe(true);
    expect(comboRuleBodyFromValues(form)).toMatchObject({ appliesToAll: false, categoryTargets: [], collectionIds: [],
      tiers: [{ minQty: 3, price: 10 }, { minQty: 5, price: 8.1 }] });
    expect(comboRuleBodyFromValues(form).tiers.every((tier) => !('maxQty' in tier))).toBe(true);
  });
  it('rejects duplicate minima', () => {
    const result = comboRuleSchema.safeParse({ ...values, tiers: [{ minQty: 3, price: 10 }, { minQty: 3, price: 8 }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['tiers'], message: 'Each band must have a different minimum quantity' }));
  });
  it.each([[], ['p1', 'p2']])('requires one product: %j', (...productIds) => {
    expect(comboRuleSchema.safeParse({ ...values, productIds, tiers: [{ minQty: 3, price: 10 }] }).success).toBe(false);
  });
});
