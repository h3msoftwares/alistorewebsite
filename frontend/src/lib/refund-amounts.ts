import type { Return } from './types';

export function calculatedMerchandiseCents(ret: Pick<Return, 'items'>): number {
  return ret.items.reduce((sum, item) => sum + Math.round(Number(item.refundAmount) * 100), 0);
}

export function effectiveMerchandiseCents(ret: Return): number {
  if (ret.status !== 'REFUNDED') return calculatedMerchandiseCents(ret);
  return ret.refundedAmount != null ? Math.round(Number(ret.refundedAmount) * 100)
    : ret.items.reduce((sum, item) => sum + Math.round(Number(item.refundedAmount ?? item.refundAmount) * 100), 0);
}

export function wasRefundAdjusted(ret: Return): boolean {
  return ret.status === 'REFUNDED' && (ret.refundWasAdjusted === true || effectiveMerchandiseCents(ret) !== calculatedMerchandiseCents(ret));
}
