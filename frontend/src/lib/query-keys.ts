import type { CatalogListQuery, CustomerListQuery, ProductListQuery, UUID } from './types';

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
    products: (id: UUID) => ['collections', 'detail', id, 'products'] as const,
  },
  categories: {
    all: () => ['categories'] as const,
    list: (parentId?: UUID) => ['categories', 'list', parentId ?? null] as const,
    adminList: (query: CatalogListQuery) => ['categories', 'list', 'admin', query] as const,
    topLevel: () => ['categories', 'list', 'topLevel'] as const,
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
    admin: (status?: string[], flagged?: boolean, awaitingCod?: boolean) =>
      ['orders', 'admin', status?.join(',') ?? null, flagged ?? false, awaitingCod ?? false] as const,
    dashboard: () => ['orders', 'dashboard'] as const,
  },
  customers: {
    all: () => ['customers'] as const,
    list: (query: CustomerListQuery) => ['customers', 'list', query] as const,
    detail: (id: UUID) => ['customers', 'detail', id] as const,
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
  blacklist: {
    all: () => ['blacklist'] as const,
    list: () => ['blacklist', 'list'] as const,
  },
  returns: {
    all: () => ['returns'] as const,
    admin: (status?: string[]) => ['returns', 'admin', status?.join(',') ?? null] as const,
  },
  notifications: {
    all: () => ['notifications'] as const,
    list: (unreadOnly?: boolean) => ['notifications', 'list', unreadOnly ?? false] as const,
  },
  discounts: {
    promotions: {
      all: () => ['discounts', 'promotions'] as const,
      detail: (id: UUID) => ['discounts', 'promotions', id] as const,
    },
    coupons: {
      all: () => ['discounts', 'coupons'] as const,
    },
  },
  loyalty: {
    rules: () => ['loyalty', 'rules'] as const,
  },
  settings: {
    root: () => ['settings'] as const,
  },
  backup: {
    list: () => ['backup', 'list'] as const,
    driveStatus: () => ['backup', 'drive', 'status'] as const,
    settings: () => ['backup', 'settings'] as const,
  },
} as const;
