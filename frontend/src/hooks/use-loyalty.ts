'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loyaltyApi } from '@/lib/api';
import type { LoyaltyRuleBody, UUID } from '@/lib/types';

const LOYALTY_RULES_KEY = ['loyalty-rules'] as const;

export function useLoyaltyRules() {
  return useQuery({ queryKey: LOYALTY_RULES_KEY, queryFn: loyaltyApi.listLoyaltyRules });
}

export function useCreateLoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoyaltyRuleBody) => loyaltyApi.createLoyaltyRule(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOYALTY_RULES_KEY }),
  });
}

export function useUpdateLoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<LoyaltyRuleBody> }) =>
      loyaltyApi.updateLoyaltyRule(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOYALTY_RULES_KEY }),
  });
}

export function useDeleteLoyaltyRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => loyaltyApi.deleteLoyaltyRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LOYALTY_RULES_KEY }),
  });
}
