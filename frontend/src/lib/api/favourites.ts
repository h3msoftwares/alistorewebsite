import { api } from './client';
import type { FavouriteEntry, UUID } from '../types';

// Mirrors lib/api/cart.ts: thin wrappers over the shared `api` client, each
// unwrapping the envelope the backend returns. All three routes require auth
// (see backend/src/modules/favourites) — the guest path never calls these.

export function listFavourites() {
  return api.get<{ favourites: FavouriteEntry[] }>('/api/favourites').then((r) => r.favourites);
}

export function addFavourite(productId: UUID) {
  return api
    .post<{ favourite: FavouriteEntry }>('/api/favourites', { productID: productId })
    .then((r) => r.favourite);
}

export function removeFavourite(productId: UUID) {
  return api.del(`/api/favourites/${productId}`);
}
