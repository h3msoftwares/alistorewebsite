'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as refunds from '@/lib/api/refunds';
import { queryKeys } from '@/lib/query-keys';
import type { CashPayoutInput, CreateGoodwillInput } from '@/lib/types';

export function useRefundSummary(orderID: string, enabled: boolean) {
  return useQuery({ queryKey: [...queryKeys.orders.detail(orderID), 'refunds'], queryFn: () => refunds.summary(orderID), enabled });
}
type RefundAction = { action: 'create'; body: CreateGoodwillInput }
  | { action: 'pay'; id: string; body: CashPayoutInput } | { action: 'cancel'; id: string; reason: string };
export function useGoodwillAction(orderID: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: RefundAction) => input.action === 'create' ? refunds.create(orderID, input.body)
    : input.action === 'pay' ? refunds.pay(orderID, input.id, input.body) : refunds.cancel(orderID, input.id, input.reason),
  onSuccess: () => {
    void qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
    void qc.invalidateQueries({ queryKey: queryKeys.returns.all() });
    void qc.invalidateQueries({ queryKey: queryKeys.analytics.all() });
  } });
}
