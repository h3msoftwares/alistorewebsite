import { Decimal } from '@prisma/client/runtime/library';

/** Round to 2 decimal places for currency math done outside Prisma/Decimal. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toNumber(d: Decimal | number): number {
  return typeof d === 'number' ? d : d.toNumber();
}
