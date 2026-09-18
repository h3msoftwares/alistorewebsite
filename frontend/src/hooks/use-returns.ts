'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { returnsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { CreateReturnBody, ReturnStatus, UUID } from '@/lib/types';

// ---- Storefront ----

export function useRequestReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: UUID; body: CreateReturnBody }) =>
      returnsApi.requestReturn(orderId, body),
    onSuccess: (_ret, { orderId }) => qc.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) }),
  });
}

export function useRequestReturnByToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ token, body }: { token: string; body: CreateReturnBody }) =>
      returnsApi.requestReturnByToken(token, body),
    onSuccess: (_ret, { token }) => qc.invalidateQueries({ queryKey: queryKeys.orders.track(token) }),
  });
}

export function useCancelReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, returnId }: { orderId: UUID; returnId: UUID }) =>
      returnsApi.cancelReturn(orderId, returnId),
    onSuccess: (_ret, { orderId }) => qc.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) }),
  });
}

export function useCancelReturnByToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ token, returnId }: { token: string; returnId: UUID }) =>
      returnsApi.cancelReturnByToken(token, returnId),
    onSuccess: (_ret, { token }) => qc.invalidateQueries({ queryKey: queryKeys.orders.track(token) }),
  });
}

// ---- Admin ----

export function useAdminReturns(statuses?: ReturnStatus[]) {
  return useQuery({
    queryKey: queryKeys.returns.admin(statuses),
    queryFn: () => returnsApi.adminListReturns(statuses),
  });
}

// Step-up (S2) protected on the backend, same as useUpdateOrderStatus — a
// rejected mutation surfaces the ApiError as-is (code 'STEP_UP_REQUIRED'),
// and the caller (admin/orders/returns/page.tsx) is responsible for
// catching that and re-prompting, exactly like admin/orders/page.tsx's own
// `run()`/`stepUpPrompt` pattern for order-status changes.
export function useUpdateReturnStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: UUID; status: ReturnStatus }) =>
      returnsApi.adminUpdateReturnStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.returns.all() }),
  });
}
