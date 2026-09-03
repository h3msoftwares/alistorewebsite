import { Decimal } from '@prisma/client/runtime/library';
import type { DiscountType } from '@prisma/client';
import { round2, toNumber } from './money';

type Money = Decimal | number;

/** The price a shopper actually pays after the product's sale, clamped to >= 0.
 *  No sale (either field null) ⇒ the base price. */
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
