import type { ProductListQuery, UUID } from './types';

// Central query-key factory so invalidation stays consistent across hooks.
export const queryKeys = {
  auth: {
    profile: () => ['auth', 'profile'] as const,
  },
  collections: {
    all: () => ['collections'] as const,
    list: (includeInactive = false) => ['collections', 'list', { includeInactive }] as const,
    detail: (id: UUID) => ['collections', 'detail', id] as const,
    bySlug: (slug: string) => ['collections', 'slug', slug] as const,
  },
  categories: {
    all: () => ['categories'] as const,
    list: (collectionId?: UUID) => ['categories', 'list', collectionId ?? null] as const,
    detail: (id: UUID) => ['categories', 'detail', id] as const,
  },
  products: {
    all: () => ['products'] as const,
    list: (query: ProductListQuery) => ['products', 'list', query] as const,
    detail: (id: UUID) => ['products', 'detail', id] as const,
  },
  cart: {
    root: () => ['cart'] as const,
  },
  orders: {
    all: () => ['orders'] as const,
    mine: () => ['orders', 'mine'] as const,
    detail: (id: UUID) => ['orders', 'detail', id] as const,
    admin: (status?: string) => ['orders', 'admin', status ?? null] as const,
    dashboard: () => ['orders', 'dashboard'] as const,
  },
  addresses: {
    all: () => ['addresses'] as const,
    list: () => ['addresses', 'list'] as const,
    detail: (id: UUID) => ['addresses', 'detail', id] as const,
  },
} as const;
