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

// ---- Catalog discounts (collection / category / all-items) ----

/** The shape lib/pricing needs from a Discount row — decoupled from Prisma. */
export interface AppliedDiscount {
  id: string;
  type: DiscountType;
  value: number;
  stacking: 'STACK' | 'OVERRIDE';
}

function amountOff(type: DiscountType, value: number, price: number): number {
  return type === 'PERCENT' ? (price * value) / 100 : value;
}

/**
 * Final unit price after BOTH the product's own sale and one catalog
 * discount.
 *
 *  - STACK    → product sale first, then the discount off the reduced price.
 *  - OVERRIDE → discount off the ORIGINAL price; the product sale is ignored.
 *
 * Returns the plain base price (post product-sale) when `discount` is null.
 */
export function pricedWithDiscount(
  price: Money,
  saleType: DiscountType | null | undefined,
  saleValue: Money | null | undefined,
  discount: AppliedDiscount | null | undefined
): number {
  const base = round2(toNumber(price));
  const afterSale = effectivePrice(base, saleType, saleValue);
  if (!discount) return afterSale;
  if (discount.stacking === 'OVERRIDE') {
    return round2(Math.max(0, base - amountOff(discount.type, discount.value, base)));
  }
  return round2(Math.max(0, afterSale - amountOff(discount.type, discount.value, afterSale)));
}

/**
 * Of every catalog discount that could apply to a product, pick the one that
 * should actually be used: the most specific scope wins
 * (CATEGORY > COLLECTION > ALL); within that scope the one that yields the
 * lowest price for THIS product is chosen. `discounts` is expected to be
 * pre-filtered to those active right now (see discount.service.activeDiscounts).
 */
export function pickDiscount(
  product: { price: Money; saleType: DiscountType | null; saleValue: Money | null; categoryID: string; collectionID: string | null },
  discounts: DiscountCandidate[]
): AppliedDiscount | null {
  const tiers: DiscountCandidate[][] = [
    discounts.filter((d) => d.scope === 'CATEGORY' && d.categoryID === product.categoryID),
    discounts.filter((d) => d.scope === 'COLLECTION' && d.collectionID != null && d.collectionID === product.collectionID),
    discounts.filter((d) => d.scope === 'ALL'),
  ];
  const winningTier = tiers.find((t) => t.length > 0);
  if (!winningTier) return null;

  let best: AppliedDiscount | null = null;
  let bestPrice = Infinity;
  for (const d of winningTier) {
    const applied: AppliedDiscount = { id: d.id, type: d.type, value: d.value, stacking: d.stacking };
    const p = pricedWithDiscount(product.price, product.saleType, product.saleValue, applied);
    if (p < bestPrice) {
      bestPrice = p;
      best = applied;
    }
  }
  return best;
}

export interface DiscountCandidate extends AppliedDiscount {
  scope: 'ALL' | 'COLLECTION' | 'CATEGORY';
  collectionID: string | null;
  categoryID: string | null;
}
