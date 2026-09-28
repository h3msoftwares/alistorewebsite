import type { Prisma } from '@prisma/client';
import { moneyCents } from './return-pricing';

/** Internal refund reasons and actor metadata never cross customer/guest APIs.
 * The original pricing explanation describes only the calculated amount. */
export function publicReturn<T extends {
  refundAdjustmentReason?: unknown; refundAdjustedBy?: unknown; refundAdjustedAt?: unknown;
  deliveryRefundReason?: unknown; refundAmount?: unknown; refundedAmount?: unknown;
  items: { refundAmount: Prisma.Decimal | string | number; refundBreakdown?: unknown }[];
}>(ret: T) {
  const visible = { ...ret };
  delete visible.refundAdjustmentReason;
  delete visible.refundAdjustedBy;
  delete visible.refundAdjustedAt;
  delete visible.deliveryRefundReason;
  const calculatedCents = ret.items.reduce((sum, item) => sum + moneyCents(item.refundAmount), 0);
  const adjusted = ret.refundedAmount != null && Math.round(Number(ret.refundedAmount) * 100) !== calculatedCents;
  return { ...visible, refundWasAdjusted: adjusted, items: ret.items.map(item => adjusted ? { ...item, refundBreakdown: null } : item) };
}

export function publicOrder<T extends object>(order: T) {
  const returns = (order as { returns?: Parameters<typeof publicReturn>[0][] }).returns;
  return { ...order, ...(returns ? { returns: returns.map(publicReturn) } : {}) };
}
