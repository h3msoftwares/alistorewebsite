'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loyaltyApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { LoyaltyRuleBody, UUID } from '@/lib/types';

export function useLoyaltyRules() {
  return useQuery({ queryKey: queryKeys.loyalty.rules(), queryFn: loyaltyApi.listLoyaltyRules });
}

export function useCreateLoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoyaltyRuleBody) => loyaltyApi.createLoyaltyRule(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.loyalty.rules() }),
  });
}

export function useUpdateLoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<LoyaltyRuleBody> }) =>
      loyaltyApi.updateLoyaltyRule(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.loyalty.rules() }),
  });
}

export function useDeleteLoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => loyaltyApi.deleteLoyaltyRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.loyalty.rules() }),
  });
}
