import { api } from './client';
import type {
  Coupon,
  CouponBody,
  Promotion,
  PromotionBody,
  PromotionCoveragePreview,
  ResolvedCoupon,
  UUID,
} from '../types';

// ---- Promotions (admin) ----
// Route/permission namespace stays "discounts" — renaming Role.permissions
// strings would be a data migration, not just a rename.

export function listPromotions() {
  return api.get<{ promotions: Promotion[] }>('/api/promotions').then((r) => r.promotions);
}

export function getPromotion(id: UUID) {
  return api.get<{ promotion: Promotion }>(`/api/promotions/${id}`).then((r) => r.promotion);
}

export function createPromotion(body: PromotionBody) {
  return api.post<{ promotion: Promotion }>('/api/promotions', body).then((r) => r.promotion);
}

export function updatePromotion(id: UUID, body: Partial<PromotionBody>) {
  return api.patch<{ promotion: Promotion }>(`/api/promotions/${id}`, body).then((r) => r.promotion);
}

export function deletePromotion(id: UUID) {
  return api.del(`/api/promotions/${id}`);
}

export interface PreviewPromotionCoverageBody {
  appliesToAll: boolean;
  productIds: UUID[];
  categoryTargets: { categoryId: UUID; includeDescendants: boolean }[];
  collectionIds: UUID[];
}

export function previewPromotionCoverage(body: PreviewPromotionCoverageBody) {
  return api.post<PromotionCoveragePreview>('/api/promotions/preview-coverage', body);
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
