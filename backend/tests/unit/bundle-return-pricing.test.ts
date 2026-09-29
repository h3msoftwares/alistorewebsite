import { describe, expect, it } from 'vitest';
import { calculateBundleRefund, type BundleReturnPurchase } from '../../src/lib/bundle-return-pricing';

const purchase = (a = 2, b = 1, instances = 1, flat = 8000): BundleReturnPurchase => ({
  orderBundleID: 'bundle', nameEn: 'Recipe', nameAr: 'باقة', instanceCount: instances, flatPriceCents: flat,
  originalNetCents: instances * flat + (a - instances * 2) * 3000 + (b - instances) * 4000,
  components: [
    { orderItemID: 'a', productName: 'A', quantity: a, requiredQuantity: 2, individualPriceCents: 3000 },
    { orderItemID: 'b', productName: 'B', quantity: b, requiredQuantity: 1, individualPriceCents: 4000 },
  ],
});
const claim = (id: string, quantity: number) => [{ orderItemID: id, quantity }];

describe('Bundle kept-quantity refunds', () => {
  it('returns surplus at its paid individual price, retaining the complete recipe', () => {
    expect(calculateBundleRefund(purchase(3), {}, claim('a', 1), 0)).toMatchObject({
      refundCents: 3000, keptInstanceCount: 1, keptNetCents: 8000, lostDiscountCents: 0,
    });
  });
  it('reprices broken recipes and preserves sequential calculated history', () => {
    const p = purchase();
    expect(calculateBundleRefund(p, {}, claim('a', 1), 0)).toMatchObject({ refundCents: 1000, keptNetCents: 7000, lostDiscountCents: 2000 });
    expect(calculateBundleRefund(p, { a: 1 }, claim('a', 1), 1000).refundCents).toBe(3000);
    // B initially carried only $32 of paid allocations. Its final entitlement
    // is $40 after the earlier returns already forfeited the Bundle discount.
    expect(calculateBundleRefund(p, { a: 2 }, claim('b', 1), 4000).refundCents).toBe(4000);
  });
  it('retains maximum complete instances, regardless of accounting unit positions', () => {
    expect(calculateBundleRefund(purchase(4, 2, 2), {}, claim('a', 1), 0)).toMatchObject({
      keptInstanceCount: 1, keptNetCents: 15000, refundCents: 1000,
    });
    expect(calculateBundleRefund(purchase(4, 2, 2), { a: 1 }, claim('b', 1), 1000)).toMatchObject({
      keptInstanceCount: 1, keptNetCents: 11000, refundCents: 4000,
    });
  });
  it('refunds full recipes and allocates cents deterministically in mixed-line requests', () => {
    const p = purchase(2, 1, 1, 8001);
    const selected = [{ orderItemID: 'a', quantity: 2 }, { orderItemID: 'b', quantity: 1 }];
    const c = calculateBundleRefund(p, {}, selected, 0);
    expect(c.refundCents).toBe(8001);
    expect(c.allocations).toEqual([{ orderItemID: 'a', quantity: 2, refundCents: 4801 }, { orderItemID: 'b', quantity: 1, refundCents: 3200 }]);
    expect(calculateBundleRefund(p, {}, [...selected].reverse(), 0).allocations.reverse()).toEqual(c.allocations);
  });
  it('sequential and batch returns reach the same cumulative entitlement', () => {
    const p = purchase(7, 3, 3, 8001);
    let previous = 0; const returned: Record<string, number> = {};
    for (const [id, quantity] of [['a', 1], ['a', 3], ['b', 2], ['a', 3], ['b', 1]] as const) {
      const c = calculateBundleRefund(p, returned, claim(id, quantity), previous);
      previous += c.refundCents; returned[id] = (returned[id] ?? 0) + quantity;
    }
    expect(previous).toBe(p.originalNetCents);
    expect(calculateBundleRefund(p, {}, [{ orderItemID: 'a', quantity: 7 }, { orderItemID: 'b', quantity: 3 }], 0).refundCents).toBe(previous);
  });
  it('fails closed on inconsistent purchase facts, quantities and history', () => {
    expect(() => calculateBundleRefund({ ...purchase(), originalNetCents: 7999 }, {}, claim('a', 1), 0)).toThrow(/reconcile/);
    expect(() => calculateBundleRefund(purchase(), {}, claim('a', 3), 0)).toThrow(/reconcile/);
    expect(() => calculateBundleRefund(purchase(), { a: -1 }, claim('a', 1), 0)).toThrow(/reconcile/);
    expect(() => calculateBundleRefund(purchase(), {}, claim('a', 1), 8001)).toThrow(/reconcile/);
  });
  it('keeps exact allocations at the schema money limit', () => {
    const p: BundleReturnPurchase = { ...purchase(), flatPriceCents: 799999999998, originalNetCents: 799999999998,
      components: [
        { ...purchase().components[0], individualPriceCents: 299999999999 },
        { ...purchase().components[1], individualPriceCents: 399999999999 },
      ] };
    const c = calculateBundleRefund(p, {}, [{ orderItemID: 'a', quantity: 2 }, { orderItemID: 'b', quantity: 1 }], 0);
    expect(c.refundCents).toBe(p.originalNetCents);
    expect(c.allocations.reduce((n, a) => n + a.refundCents, 0)).toBe(p.originalNetCents);
    expect(c.allocations.every(a => Number.isSafeInteger(a.refundCents))).toBe(true);
  });
});
