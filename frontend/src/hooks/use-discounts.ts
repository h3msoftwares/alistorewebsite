'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { discountsApi } from '@/lib/api';
import type { PreviewPromotionCoverageBody } from '@/lib/api/discounts';
import { queryKeys } from '@/lib/query-keys';
import type { CouponBody, PromotionBody, UUID } from '@/lib/types';

// ---- Promotions ----

export function usePromotions() {
  return useQuery({ queryKey: queryKeys.discounts.promotions.all(), queryFn: discountsApi.listPromotions });
}

export function usePromotion(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.discounts.promotions.detail(id as UUID),
    queryFn: () => discountsApi.getPromotion(id as UUID),
    enabled: Boolean(id),
  });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PromotionBody) => discountsApi.createPromotion(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.discounts.promotions.all() });
      // Prices everywhere depend on active promotions.
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
    },
  });
}

export function useUpdatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<PromotionBody> }) =>
      discountsApi.updatePromotion(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.discounts.promotions.all() });
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
    },
  });
}

export function useDeletePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => discountsApi.deletePromotion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.discounts.promotions.all() });
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
    },
  });
}

// Read-only, on demand — no query key/cache needed (a mutation just for its
// "call this whenever, get a promise back" shape, not because it mutates
// anything).
export function usePreviewPromotionCoverage() {
  return useMutation({
    mutationFn: (body: PreviewPromotionCoverageBody) => discountsApi.previewPromotionCoverage(body),
  });
}

// ---- Coupons ----

export function useCoupons() {
  return useQuery({ queryKey: queryKeys.discounts.coupons.all(), queryFn: discountsApi.listCoupons });
}

// No dedicated GET /api/coupons/:id — coupons are always a short admin-
// managed list, so the edit page just reads it out of the same list query
// every other coupon view already uses (fetching automatically if it isn't
// cached yet, e.g. a direct link/refresh straight to the edit page).
export function useCoupon(id: UUID | undefined) {
  const { data, ...rest } = useCoupons();
  return { ...rest, data: data?.find((c) => c.id === id) };
}

export function useCreateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CouponBody) => discountsApi.createCoupon(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.discounts.coupons.all() }),
  });
}

export function useUpdateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<CouponBody> }) =>
      discountsApi.updateCoupon(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.discounts.coupons.all() }),
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => discountsApi.deleteCoupon(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.discounts.coupons.all() }),
  });
}
