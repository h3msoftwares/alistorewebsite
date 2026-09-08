import type { DiscountType, Prisma } from '@prisma/client';
import { pickDiscount, pricedWithDiscount, type DiscountCandidate } from './pricing';

type Money = Prisma.Decimal | number;

interface LineVariant {
  price: Money | null;
  product: {
    price: Money;
    saleType: DiscountType | null;
    saleValue: Money | null;
    categoryID: string;
    collectionID: string | null;
  };
}

/**
 * The effective unit price for one cart / order line: variant price override
 * (falls back to the product price) → the product's own sale → the best
 * active catalog discount for that product. See lib/pricing.ts.
 */
export function lineUnitPrice(variant: LineVariant, discounts: DiscountCandidate[]): number {
  const p = variant.product;
  const picked = pickDiscount(p, discounts);
  const base = variant.price ?? p.price;
  return pricedWithDiscount(base, p.saleType, p.saleValue, picked);
}
