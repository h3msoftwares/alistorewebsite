import type { Prisma } from '@prisma/client';
import { moneyCents } from './return-pricing';

/** Internal refund reasons and actor metadata never cross customer/guest APIs.
 * The original pricing explanation describes only the calculated amount. */
export function publicReturn<T extends {
  refundAdjustmentReason?: unknown; refundAdjustedBy?: unknown; refundAdjustedAt?: unknown;
  deliveryRefundReason?: unknown; refundAmount?: unknown; refundedAmount?: unknown;
  payout?: unknown;
  bundleCalculations?: unknown;
  items: { refundAmount: Prisma.Decimal | string | number; refundBreakdown?: unknown }[];
}>(ret: T) {
  const visible = { ...ret };
  delete visible.refundAdjustmentReason;
  delete visible.refundAdjustedBy;
  delete visible.refundAdjustedAt;
  delete visible.deliveryRefundReason;
  delete visible.payout;
  const calculatedCents = ret.items.reduce((sum, item) => sum + moneyCents(item.refundAmount), 0);
  const adjusted = ret.refundedAmount != null && Math.round(Number(ret.refundedAmount) * 100) !== calculatedCents;
  return { ...visible, ...(adjusted && ret.bundleCalculations ? { bundleCalculations: [] } : {}),
    refundWasAdjusted: adjusted, items: ret.items.map(item => adjusted ? { ...item, refundBreakdown: null } : item) };
}

export function publicOrder<T extends object>(order: T) {
  const returns = (order as { returns?: Parameters<typeof publicReturn>[0][] }).returns;
  const goodwill = (order as { goodwillRefunds?: { id: string; status: string; amount: unknown }[] }).goodwillRefunds;
  const indicators = (order as { returnIndicators?: { awaitingMarkingReturns: number; awaitingMarkingCents: number } }).returnIndicators;
  return { ...order, ...(returns ? { returns: returns.map(publicReturn) } : {}),
    ...(goodwill ? { goodwillRefunds: goodwill.filter(g => g.status === 'PAID').map(g => ({ id: g.id, status: 'PAID', amount: g.amount })) } : {}),
    // OWED goodwill and its reservation are internal, including derived counters.
    ...(indicators ? { returnIndicators: { ...indicators, owedGoodwillCount: 0, owedGoodwillCents: 0,
      refundDueCount: indicators.awaitingMarkingReturns, refundDueCents: indicators.awaitingMarkingCents } } : {}) };
}
