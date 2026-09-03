import { api } from './client';
import type { CartItem, CartView, UUID } from '../types';

export function getCart() {
  return api.get<CartView>('/api/cart');
}

export function addCartItem(variantId: UUID, quantity = 1) {
  return api.post<{ item: CartItem }>('/api/cart/items', { variantId, quantity }).then((r) => r.item);
}

export function updateCartItem(itemId: UUID, quantity: number) {
  return api
    .patch<{ item: CartItem }>(`/api/cart/items/${itemId}`, { quantity })
    .then((r) => r.item);
}

export function removeCartItem(itemId: UUID) {
  return api.del(`/api/cart/items/${itemId}`);
}

export function clearCart() {
  return api.del('/api/cart');
}
