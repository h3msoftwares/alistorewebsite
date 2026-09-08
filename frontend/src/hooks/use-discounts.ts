'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { discountsApi } from '@/lib/api';
import type { CouponBody, DiscountBody, UUID } from '@/lib/types';

const DISCOUNTS_KEY = ['discounts'] as const;
const COUPONS_KEY = ['coupons'] as const;

// ---- Catalog discounts ----

export function useDiscounts() {
  return useQuery({ queryKey: DISCOUNTS_KEY, queryFn: discountsApi.listDiscounts });
}

export function useCreateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DiscountBody) => discountsApi.createDiscount(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DISCOUNTS_KEY });
      // Prices everywhere depend on active discounts.
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useUpdateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<DiscountBody> }) =>
      discountsApi.updateDiscount(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DISCOUNTS_KEY });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => discountsApi.deleteDiscount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DISCOUNTS_KEY });
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
