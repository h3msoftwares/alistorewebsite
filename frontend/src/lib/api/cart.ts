import { api } from './client';
import type { CartItem, CartView, UUID } from '../types';

export function getCart() {
  return api.get<CartView>('/api/cart');
}

export function addCartItem(variantId: UUID, quantity = 1) {
  return api.post<{ item: CartItem }>('/api/cart/items', { variantId, quantity }).then((r) => r.item);
}

/** `quantity` and/or `variantId` — a `variantId` repoints the line at a
 *  different size/color; omitting `quantity` alongside it keeps the current
 *  quantity. The backend merges into an existing line for that variant if
 *  one already exists, so the returned item's id may differ from `itemId`. */
export function updateCartItem(itemId: UUID, changes: { quantity?: number; variantId?: UUID }) {
  return api
    .patch<{ item: CartItem }>(`/api/cart/items/${itemId}`, changes)
    .then((r) => r.item);
}

export function removeCartItem(itemId: UUID) {
  return api.del(`/api/cart/items/${itemId}`);
}

export function clearCart() {
  return api.del('/api/cart');
}
