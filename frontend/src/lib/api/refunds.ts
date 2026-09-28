import { api } from './client';
import type { CashPayoutInput, CreateGoodwillInput, GoodwillRefund, RefundSummary, UUID } from '../types';

export function summary(orderID: UUID) { return api.get<RefundSummary>(`/api/admin/orders/${orderID}/refunds`); }
export function create(orderID: UUID, body: CreateGoodwillInput) {
  return api.post<{ refund: GoodwillRefund }>(`/api/admin/orders/${orderID}/goodwill-refunds`, body);
}
export function pay(orderID: UUID, id: UUID, body: CashPayoutInput) {
  return api.post<{ refund: GoodwillRefund }>(`/api/admin/orders/${orderID}/goodwill-refunds/${id}/pay`, body);
}
export function cancel(orderID: UUID, id: UUID, reason: string) {
  return api.post<{ refund: GoodwillRefund }>(`/api/admin/orders/${orderID}/goodwill-refunds/${id}/cancel`, { reason });
}
