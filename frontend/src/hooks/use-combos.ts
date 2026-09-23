'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { combosApi } from '@/lib/api';
import type { PreviewComboCoverageBody } from '@/lib/api/combos';
import { queryKeys } from '@/lib/query-keys';
import type { ComboRuleBody, UUID } from '@/lib/types';

export function useComboRules() {
  return useQuery({ queryKey: queryKeys.combos.rules.all(), queryFn: combosApi.listComboRules });
}

// No dedicated GET /api/combo-rules/:id round trip on the edit page — same
// "read it out of the already-fetched list" convention useCoupon() uses,
// since this is a short admin-managed list too.
export function useComboRule(id: UUID | undefined) {
  const { data, ...rest } = useComboRules();
  return { ...rest, data: data?.find((r) => r.id === id) };
}

export function useCreateComboRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ComboRuleBody) => combosApi.createComboRule(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.combos.rules.all() });
      // Combo pricing shows up in the cart/product pricing paths.
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
      qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
    },
  });
}

export function useUpdateComboRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<ComboRuleBody> }) => combosApi.updateComboRule(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.combos.rules.all() });
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
      qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
    },
  });
}

export function useDeleteComboRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => combosApi.deleteComboRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.combos.rules.all() });
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
      qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
    },
  });
}

// Read-only, on demand — same shape as usePreviewPromotionCoverage().
export function usePreviewComboCoverage() {
  return useMutation({
    mutationFn: (body: PreviewComboCoverageBody) => combosApi.previewComboCoverage(body),
  });
}
