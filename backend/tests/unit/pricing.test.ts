import { describe, it, expect } from 'vitest';
import {
  effectivePrice,
  isOnSale,
  pricedWithPromotion,
  pickPromotion,
  type PromotionCandidate,
} from '../../src/lib/pricing';

describe('effectivePrice / isOnSale', () => {
  it('returns the plain (rounded) price when there is no sale', () => {
    expect(effectivePrice(19.999, null, null)).toBe(20);
    expect(effectivePrice(50, 'PERCENT', null)).toBe(50); // saleValue null ⇒ no sale
    expect(isOnSale(50, null, null)).toBe(false);
  });

  it('applies a PERCENT sale correctly and rounds to 2dp', () => {
    expect(effectivePrice(19.99, 'PERCENT', 10)).toBe(17.99);
    expect(isOnSale(19.99, 'PERCENT', 10)).toBe(true);
  });

  it('applies an AMOUNT sale and clamps at 0 instead of going negative', () => {
    expect(effectivePrice(10, 'AMOUNT', 4)).toBe(6);
    expect(effectivePrice(10, 'AMOUNT', 999)).toBe(0);
  });
});

describe('pricedWithPromotion', () => {
  const promo = (over: Partial<{ type: 'PERCENT' | 'AMOUNT'; value: number; stackable: boolean }> = {}) => ({
    id: 'p1',
    type: 'PERCENT' as const,
    value: 10,
    stackable: true,
    ...over,
  });

  it('returns the post-sale price when no promotion applies', () => {
    expect(pricedWithPromotion(100, 'PERCENT', 20, null)).toBe(80);
  });

  it('stackable=true applies the promotion ON TOP of the product sale (off the reduced price)', () => {
    // 100 -> sale 20% -> 80 -> promo 10% off 80 -> 72
    expect(pricedWithPromotion(100, 'PERCENT', 20, promo({ value: 10 }))).toBe(72);
  });

  it('stackable=false discounts the ORIGINAL price and ignores the product sale entirely', () => {
    // 100 -> promo 10% off the original 100 -> 90 (the 20% product sale never applies)
    expect(pricedWithPromotion(100, 'PERCENT', 20, promo({ value: 10, stackable: false }))).toBe(90);
  });

  it('never goes below 0 regardless of stacking', () => {
    expect(pricedWithPromotion(10, null, null, promo({ type: 'AMOUNT', value: 999, stackable: true }))).toBe(0);
    expect(pricedWithPromotion(10, null, null, promo({ type: 'AMOUNT', value: 999, stackable: false }))).toBe(0);
  });
});

describe('pickPromotion', () => {
  const product = {
    id: 'prod-1',
    price: 100,
    saleType: null,
    saleValue: null,
    categoryPaths: ['/men/shoes/'],
    collectionIds: ['col-1'],
  };

  function candidate(over: Partial<PromotionCandidate>): PromotionCandidate {
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

  it('returns null when nothing matches', () => {
    expect(pickPromotion(product, [candidate({ productIds: ['other'] })])).toBeNull();
  });

  it('matches ALL (site-wide) with no targets needed', () => {
    const result = pickPromotion(product, [candidate({ appliesToAll: true })]);
    expect(result?.source).toBe('ALL');
  });

  it('matches PRODUCT via a direct product-id target', () => {
    const result = pickPromotion(product, [candidate({ productIds: [product.id] })]);
    expect(result?.source).toBe('PRODUCT');
  });

  it('matches COLLECTION and reports the matching collection name', () => {
    const result = pickPromotion(product, [
      candidate({ collections: [{ id: 'col-1', nameEn: 'Sale', nameAr: 'تخفيض' }] }),
    ]);
    expect(result?.source).toBe('COLLECTION');
    expect(result?.sourceNameEn).toBe('Sale');
    expect(result?.sourceNameAr).toBe('تخفيض');
  });

  it('matches CATEGORY via a path prefix when includeDescendants is true', () => {
    const result = pickPromotion(product, [
      candidate({
        categoryTargets: [{ path: '/men/', includeDescendants: true, nameEn: 'Men', nameAr: 'رجال' }],
      }),
    ]);
    expect(result?.source).toBe('CATEGORY');
    expect(result?.sourceNameEn).toBe('Men');
  });

  it('does NOT match a category target when includeDescendants is false and the path is not exact', () => {
    const result = pickPromotion(product, [
      candidate({
        categoryTargets: [{ path: '/men/', includeDescendants: false, nameEn: 'Men', nameAr: 'رجال' }],
      }),
    ]);
    expect(result).toBeNull();
  });

  it('picks the highest-priority match, not the most specific scope', () => {
    const lowPriorityDirect = candidate({ id: 'low', priority: 0, productIds: [product.id], value: 5 });
    const highPriorityAll = candidate({ id: 'high', priority: 10, appliesToAll: true, value: 50 });
    const result = pickPromotion(product, [lowPriorityDirect, highPriorityAll]);
    expect(result?.id).toBe('high');
  });

  it('breaks a priority tie by whichever gives the lower final price', () => {
    const cheaper = candidate({ id: 'cheaper', priority: 5, appliesToAll: true, type: 'PERCENT', value: 50 });
    const pricier = candidate({ id: 'pricier', priority: 5, appliesToAll: true, type: 'PERCENT', value: 10 });
    const result = pickPromotion(product, [pricier, cheaper]);
    expect(result?.id).toBe('cheaper');
  });

  it('carries the promotion name through onto the picked result', () => {
    const result = pickPromotion(product, [candidate({ appliesToAll: true, nameEn: 'Summer Sale', nameAr: 'تخفيضات الصيف' })]);
    expect(result?.nameEn).toBe('Summer Sale');
    expect(result?.nameAr).toBe('تخفيضات الصيف');
  });
});
