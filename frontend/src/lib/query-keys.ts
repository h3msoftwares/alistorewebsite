import type { CatalogListQuery, ProductListQuery, UUID } from './types';

// Central query-key factory so invalidation stays consistent across hooks.
export const queryKeys = {
  auth: {
    profile: () => ['auth', 'profile'] as const,
  },
  collections: {
    all: () => ['collections'] as const,
    list: (includeInactive = false) => ['collections', 'list', { includeInactive }] as const,
    adminList: (query: CatalogListQuery) => ['collections', 'list', 'admin', query] as const,
    detail: (id: UUID) => ['collections', 'detail', id] as const,
    bySlug: (slug: string) => ['collections', 'slug', slug] as const,
  },
  categories: {
    all: () => ['categories'] as const,
    list: (collectionId?: UUID) => ['categories', 'list', collectionId ?? null] as const,
    adminList: (query: CatalogListQuery) => ['categories', 'list', 'admin', query] as const,
    standalone: () => ['categories', 'list', 'standalone'] as const,
    featured: () => ['categories', 'list', 'featured'] as const,
    detail: (id: UUID) => ['categories', 'detail', id] as const,
    bySlug: (slug: string) => ['categories', 'slug', slug] as const,
    products: (id: UUID, query: ProductListQuery) =>
      ['categories', 'detail', id, 'products', query] as const,
  },
  products: {
    all: () => ['products'] as const,
    list: (query: ProductListQuery) => ['products', 'list', query] as const,
    detail: (id: UUID) => ['products', 'detail', id] as const,
    // Available size/colour filter options for a listing page — derived from
    // an unfiltered fetch of the scope, independent of the current filters.
    facetsByCollection: (id: UUID) => ['products', 'facets', 'collection', id] as const,
    facetsByCategory: (id: UUID) => ['products', 'facets', 'category', id] as const,
  },
  cart: {
    root: () => ['cart'] as const,
  },
  favourites: {
    // Logged-in only — the guest list lives in the `favourites` Redux slice.
    root: () => ['favourites'] as const,
  },
  orders: {
    all: () => ['orders'] as const,
    mine: () => ['orders', 'mine'] as const,
    detail: (id: UUID) => ['orders', 'detail', id] as const,
    track: (token: string) => ['orders', 'track', token] as const,
    admin: (status?: string, flagged?: boolean) => ['orders', 'admin', status ?? null, flagged ?? false] as const,
    dashboard: () => ['orders', 'dashboard'] as const,
  },
  analytics: {
    all: () => ['analytics'] as const,
    report: (name: string, preset: string) => ['analytics', name, preset] as const,
  },
  addresses: {
    all: () => ['addresses'] as const,
    list: () => ['addresses', 'list'] as const,
    detail: (id: UUID) => ['addresses', 'detail', id] as const,
  },
} as const;
