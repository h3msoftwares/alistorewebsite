import { Decimal } from '@prisma/client/runtime/library';
import type { DiscountType } from '@prisma/client';
import { round2, toNumber } from './money';

type Money = Decimal | number;

/** The price a shopper actually pays after the product's OWN sale, clamped to
 *  >= 0. No sale (either field null) ⇒ the base price. */
export function effectivePrice(
  price: Money,
  saleType: DiscountType | null | undefined,
  saleValue: Money | null | undefined
): number {
  const base = toNumber(price);
  if (!saleType || saleValue == null) return round2(base);
  const v = toNumber(saleValue);
  const off = saleType === 'PERCENT' ? (base * v) / 100 : v;
  return round2(Math.max(0, base - off));
}

export function isOnSale(
  price: Money,
  saleType: DiscountType | null | undefined,
  saleValue: Money | null | undefined
): boolean {
  return effectivePrice(price, saleType, saleValue) < round2(toNumber(price));
}

// ---- Promotions (product / category / collection) — Stage 2 of the catalog
// redesign, replacing the old single-scope Discount model outright. ----

/** The shape lib/pricing needs from a Promotion row — decoupled from Prisma.
 *  This is what a product's `promotion` API field is shaped like. */
export interface AppliedPromotion {
  id: string;
  type: DiscountType;
  value: number;
  // Whether this promotion applies ON TOP of the product's own sale (true —
  // the old STACK) or REPLACES it, discounting the ORIGINAL price instead
  // (false — the old OVERRIDE). Renamed from `DiscountStacking`, same
  // meaning, unchanged. Governs ONLY this interaction — see pickPromotion()
  // for why promotions never combine with each OTHER.
  stackable: boolean;
}

function amountOff(type: DiscountType, value: number, price: number): number {
  return type === 'PERCENT' ? (price * value) / 100 : value;
}

/**
 * Final unit price after BOTH the product's own sale and one promotion.
 *
 *  - stackable=true  → product sale first, then the promotion off the reduced price.
 *  - stackable=false → promotion off the ORIGINAL price; the product sale is ignored.
 *
 * Returns the plain base price (post product-sale) when `promotion` is null.
 */
export function pricedWithPromotion(
  price: Money,
  saleType: DiscountType | null | undefined,
  saleValue: Money | null | undefined,
  promotion: AppliedPromotion | null | undefined
): number {
  const base = round2(toNumber(price));
  const afterSale = effectivePrice(base, saleType, saleValue);
  if (!promotion) return afterSale;
  if (!promotion.stackable) {
    return round2(Math.max(0, base - amountOff(promotion.type, promotion.value, base)));
  }
  return round2(Math.max(0, afterSale - amountOff(promotion.type, promotion.value, afterSale)));
}

/** Everything pickPromotion needs to test whether a Promotion covers a given
 *  product, plus the fields needed to price it once picked. */
export interface PromotionCandidate extends AppliedPromotion {
  nameEn: string;
  nameAr: string;
  priority: number;
  /** Site-wide — covers every product regardless of the target arrays below.
   *  See the Promotion model's doc comment in schema.prisma for why this
   *  exists beyond the architecture doc's literal sketch. */
  appliesToAll: boolean;
  productIds: string[];
  categoryTargets: { path: string; includeDescendants: boolean; nameEn: string; nameAr: string }[];
  collections: { id: string; nameEn: string; nameAr: string }[];
}

/** Which target actually matched, and (for a COLLECTION/CATEGORY match) that
 *  target's own name — what the admin product page shows so an admin can
 *  see WHICH collection/category is behind a product's promotion, not just
 *  that "some" promotion applies. */
export interface PromotionMatch {
  source: 'ALL' | 'PRODUCT' | 'COLLECTION' | 'CATEGORY';
  sourceNameEn?: string;
  sourceNameAr?: string;
}

function matchPromotion(
  promo: PromotionCandidate,
  product: { id: string; categoryPaths: string[]; collectionIds: string[] }
): PromotionMatch | null {
  if (promo.appliesToAll) return { source: 'ALL' };
  if (promo.productIds.includes(product.id)) return { source: 'PRODUCT' };
  const collectionHit = promo.collections.find((c) => product.collectionIds.includes(c.id));
  if (collectionHit) return { source: 'COLLECTION', sourceNameEn: collectionHit.nameEn, sourceNameAr: collectionHit.nameAr };
  const categoryHit = promo.categoryTargets.find((t) =>
    product.categoryPaths.some((p) => (t.includeDescendants ? p.startsWith(t.path) : p === t.path))
  );
  if (categoryHit) return { source: 'CATEGORY', sourceNameEn: categoryHit.nameEn, sourceNameAr: categoryHit.nameAr };
  return null;
}

function promotionCoversProduct(
  promo: PromotionCandidate,
  product: { id: string; categoryPaths: string[]; collectionIds: string[] }
): boolean {
  return matchPromotion(promo, product) !== null;
}

/**
 * Of every promotion that could apply to a product, pick the one that
 * actually applies: single winner by `priority` (confirmed design — NOT
 * "most specific scope wins", the old Discount behavior this session
 * deliberately reopened rather than inherited). The highest-priority
 * ACTIVE, in-window match covering this product wins outright; promotions
 * never combine with each other, regardless of how many also match. Ties
 * (equal priority) are broken by whichever gives the lower price.
 *
 * `promotions` is expected to be pre-filtered to those ACTIVE and in-window
 * right now (see promotion.service.activePromotions()).
 */
export interface PickedPromotion extends AppliedPromotion, PromotionMatch {
  nameEn: string;
  nameAr: string;
}

export function pickPromotion(
  product: {
    id: string;
    price: Money;
    saleType: DiscountType | null;
    saleValue: Money | null;
    categoryPaths: string[];
    collectionIds: string[];
  },
  promotions: PromotionCandidate[]
): PickedPromotion | null {
  const matches = promotions.filter((p) => promotionCoversProduct(p, product));
  if (matches.length === 0) return null;

  const topPriority = Math.max(...matches.map((m) => m.priority));
  const tied = matches.filter((m) => m.priority === topPriority);

  let best = tied[0];
  let bestPrice = pricedWithPromotion(product.price, product.saleType, product.saleValue, best);
  for (const m of tied.slice(1)) {
    const p = pricedWithPromotion(product.price, product.saleType, product.saleValue, m);
    if (p < bestPrice) {
      bestPrice = p;
      best = m;
    }
  }
  // best came from `matches`, which is pre-filtered to promotions that DO
  // match this product, so this can never be null.
  const match = matchPromotion(best, product)!;
  return { id: best.id, type: best.type, value: best.value, stackable: best.stackable, nameEn: best.nameEn, nameAr: best.nameAr, ...match };
}
