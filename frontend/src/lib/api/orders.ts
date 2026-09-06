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

// ---- Admin ----

export function adminListOrders(status?: OrderStatus) {
  return api
    .get<{ orders: Order[] }>('/api/admin/orders', { query: { status } })
    .then((r) => r.orders);
}

export function adminUpdateOrderStatus(id: UUID, status: OrderStatus) {
  return api
    .patch<{ order: Order }>(`/api/admin/orders/${id}/status`, { status })
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
