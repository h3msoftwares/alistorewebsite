import { api } from './client';
import type { Coupon, CouponBody, Discount, DiscountBody, ResolvedCoupon, UUID } from '../types';

// ---- Catalog discounts (admin) ----

export function listDiscounts() {
  return api.get<{ discounts: Discount[] }>('/api/discounts').then((r) => r.discounts);
}

export function createDiscount(body: DiscountBody) {
  return api.post<{ discount: Discount }>('/api/discounts', body).then((r) => r.discount);
}

export function updateDiscount(id: UUID, body: Partial<DiscountBody>) {
  return api.patch<{ discount: Discount }>(`/api/discounts/${id}`, body).then((r) => r.discount);
}

export function deleteDiscount(id: UUID) {
  return api.del(`/api/discounts/${id}`);
}

// ---- Coupons (admin) ----

export function listCoupons() {
  return api.get<{ coupons: Coupon[] }>('/api/coupons').then((r) => r.coupons);
}

export function createCoupon(body: CouponBody) {
  return api.post<{ coupon: Coupon }>('/api/coupons', body).then((r) => r.coupon);
}

export function updateCoupon(id: UUID, body: Partial<CouponBody>) {
  return api.patch<{ coupon: Coupon }>(`/api/coupons/${id}`, body).then((r) => r.coupon);
}

export function deleteCoupon(id: UUID) {
  return api.del(`/api/coupons/${id}`);
}

// ---- Coupon lookup (public — cart / checkout) ----

/** Resolves a code to `{ code, type, value }` when it's active and in-window;
 *  rejects (404) otherwise. */
export function validateCoupon(code: string) {
  return api.post<{ coupon: ResolvedCoupon }>('/api/coupons/validate', { code }).then((r) => r.coupon);
}
