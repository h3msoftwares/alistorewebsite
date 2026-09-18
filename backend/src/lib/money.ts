import { Decimal } from '@prisma/client/runtime/library';

/**
 * Round to 2 decimal places for currency math done outside Prisma/Decimal.
 * Goes through Decimal rather than `Math.round(n * 100) / 100` because that
 * float-based version misrounds exact-half values (e.g. `1.005 * 100` is
 * `100.49999999999999` in IEEE-754 double precision, not `100.5`) — a real
 * risk here since this is reused by coupon/promotion pricing and checkout's
 * exact-match `expectedSubtotal` guard.
 */
export function round2(n: number): number {
  return new Decimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function toNumber(d: Decimal | number): number {
  return typeof d === 'number' ? d : d.toNumber();
}
