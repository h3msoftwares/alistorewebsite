import type { DiscountType, Prisma } from '@prisma/client';
import { pickPromotion, pricedWithPromotion, type PromotionCandidate } from './pricing';
import { productCategoryPaths, productCollectionIds } from '../modules/catalog/category-tree';

type Money = Prisma.Decimal | number;

interface LineVariant {
  price: Money | null;
  product: {
    id: string;
    price: Money;
    saleType: DiscountType | null;
    saleValue: Money | null;
    primaryCategory?: { path: string } | null;
    categoryLinks?: { category: { path: string } }[];
    collectionLinks?: { collectionID: string }[];
  };
}

/**
 * The effective unit price for one cart / order line: variant price override
 * (falls back to the product price) → the product's own sale → the best
 * (single, priority-picked) active promotion for that product. See
 * lib/pricing.ts.
 */
export function lineUnitPrice(variant: LineVariant, promotions: PromotionCandidate[]): number {
  const p = variant.product;
  const picked = pickPromotion(
    {
      id: p.id,
      price: p.price,
      saleType: p.saleType,
      saleValue: p.saleValue,
      categoryPaths: productCategoryPaths(p),
      collectionIds: productCollectionIds(p),
    },
    promotions
  );
  const base = variant.price ?? p.price;
  return pricedWithPromotion(base, p.saleType, p.saleValue, picked);
}
