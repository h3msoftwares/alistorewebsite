import { describe, it, expect } from 'vitest';
import { lineUnitPrice } from '../../src/lib/line-pricing';
import type { PromotionCandidate } from '../../src/lib/pricing';

function promo(over: Partial<PromotionCandidate> = {}): PromotionCandidate {
  return {
    id: 'promo-1',
    nameEn: 'Test',
    nameAr: 'اختبار',
    type: 'PERCENT',
    value: 10,
    stackable: true,
    priority: 0,
    appliesToAll: false,
    productIds: [],
    categoryTargets: [],
    collections: [],
    ...over,
  };
}

const product = {
  id: 'prod-1',
  price: 100,
  saleType: null,
  saleValue: null,
  primaryCategory: { path: '/men/shoes/' },
  categoryLinks: [] as { category: { path: string } }[],
  collectionLinks: [] as { collectionID: string }[],
};

describe('lineUnitPrice', () => {
  it('falls back to the product price when the variant has no price override', () => {
    const variant = { price: null, product };
    expect(lineUnitPrice(variant, [])).toBe(100);
  });

  it('uses the variant price override as the base instead of the product price', () => {
    const variant = { price: 120, product };
    expect(lineUnitPrice(variant, [])).toBe(120);
  });

  it('applies an active site-wide promotion on top of the variant price', () => {
    const variant = { price: 120, product };
    const result = lineUnitPrice(variant, [promo({ appliesToAll: true, type: 'PERCENT', value: 10 })]);
    expect(result).toBe(108);
  });

  it('applies the product own sale, then the promotion on top, when both are present', () => {
    const withSale = { ...product, saleType: 'PERCENT' as const, saleValue: 20 };
    const variant = { price: null, product: withSale };
    // 100 -> 20% sale -> 80 -> promo 10% off 80 -> 72
    const result = lineUnitPrice(variant, [promo({ appliesToAll: true, value: 10 })]);
    expect(result).toBe(72);
  });

  it('ignores a promotion that does not cover this product', () => {
    const variant = { price: null, product };
    const result = lineUnitPrice(variant, [promo({ productIds: ['some-other-product'] })]);
    expect(result).toBe(100);
  });
});
