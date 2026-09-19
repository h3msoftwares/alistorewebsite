import { api } from './client';
import type {
  AdminDashboard,
  CheckoutBody,
  DeliveryQuote,
  Order,
  OrderStatus,
  ProductVariant,
  UUID,
} from '../types';

// ---- Storefront ----

export function checkout(body: CheckoutBody) {
  return api.post<{ order: Order }>('/api/orders/checkout', body).then((r) => r.order);
}

/** Live delivery-fee estimate for the caller's cart + chosen governorate. */
export function getDeliveryQuote(region: string) {
  return api.get<DeliveryQuote>('/api/orders/delivery-quote', { query: { region } });
}

export function listMyOrders() {
  return api.get<{ orders: Order[] }>('/api/orders/mine').then((r) => r.orders);
}

export function getOrder(id: UUID) {
  return api.get<{ order: Order }>(`/api/orders/${id}`).then((r) => r.order);
}

export function cancelOrder(id: UUID) {
  return api.post<{ order: Order }>(`/api/orders/${id}/cancel`).then((r) => r.order);
}

// ---- Guest tracking — the token itself is the proof of access, no login
// session needed (the backend doesn't look at req.user for these routes). ----

export function getOrderByToken(token: string) {
  return api.get<{ order: Order }>(`/api/orders/track/${token}`).then((r) => r.order);
}

export function cancelOrderByToken(token: string) {
  return api.post<{ order: Order }>(`/api/orders/track/${token}/cancel`).then((r) => r.order);
}

/** The manual fallback when a guest doesn't have their tracking link.
 *  Returns the freshly minted raw token on a match — the caller navigates to
 *  `/orders/track/${token}`. */
export function lookupOrder(orderNumber: string, contact: string) {
  return api.post<{ token: string }>('/api/orders/lookup', { orderNumber, contact }).then((r) => r.token);
}

// ---- Admin ----

export function adminListOrders(status?: OrderStatus[], flagged?: boolean, awaitingCod?: boolean) {
  return api
    .get<{ orders: Order[] }>('/api/admin/orders', {
      query: { status: status?.length ? status.join(',') : undefined, flagged, awaitingCod },
    })
    .then((r) => r.orders);
}

export function adminReviewOrder(id: UUID) {
  return api.patch<{ order: Order }>(`/api/admin/orders/${id}/review`).then((r) => r.order);
}

export function adminUpdateOrderStatus(
  id: UUID,
  status: OrderStatus,
  estimatedDeliveryDays?: number | null
) {
  return api
    .patch<{ order: Order }>(`/api/admin/orders/${id}/status`, {
      status,
      ...(estimatedDeliveryDays !== undefined ? { estimatedDeliveryDays } : {}),
    })
    .then((r) => r.order);
}

export function adminMarkCollected(id: UUID, collected: boolean) {
  return api
    .patch<{ order: Order }>(`/api/admin/orders/${id}/collected`, { collected })
    .then((r) => r.order);
}

export function adminDashboard() {
  return api.get<AdminDashboard>('/api/admin/dashboard');
}

export function adminUpdateVariantStock(variantId: UUID, stockQuantity: number) {
  return api
    .patch<{ variant: ProductVariant }>(`/api/admin/variants/${variantId}/stock`, { stockQuantity })
    .then((r) => r.variant);
}
