'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { discountsApi } from '@/lib/api';
import type { CouponBody, PromotionBody, UUID } from '@/lib/types';

const PROMOTIONS_KEY = ['promotions'] as const;
const COUPONS_KEY = ['coupons'] as const;

// ---- Promotions ----

export function usePromotions() {
  return useQuery({ queryKey: PROMOTIONS_KEY, queryFn: discountsApi.listPromotions });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PromotionBody) => discountsApi.createPromotion(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROMOTIONS_KEY });
      // Prices everywhere depend on active promotions.
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<PromotionBody> }) =>
      discountsApi.updatePromotion(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROMOTIONS_KEY });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeletePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => discountsApi.deletePromotion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROMOTIONS_KEY });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

// ---- Coupons ----

export function useCoupons() {
  return useQuery({ queryKey: COUPONS_KEY, queryFn: discountsApi.listCoupons });
}

export function useCreateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CouponBody) => discountsApi.createCoupon(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: COUPONS_KEY }),
  });
}

export function useUpdateCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<CouponBody> }) =>
      discountsApi.updateCoupon(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: COUPONS_KEY }),
  });
}

export function useDeleteCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => discountsApi.deleteCoupon(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: COUPONS_KEY }),
  });
}
