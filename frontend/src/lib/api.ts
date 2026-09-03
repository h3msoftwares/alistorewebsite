// Thin typed fetch layer. Pages should call the named helpers below (or add
// new ones here) rather than hardcoding paths. TanStack Query wrapping lands
// with the first real pages in Week 2.
import type {
  CartView,
  Category,
  Collection,
  Order,
  Product,
  ProductListQuery,
  ProductListResult,
} from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}

// ---- Catalog ----

export function getCollections() {
  return apiFetch<{ collections: Collection[] }>('/api/collections').then((r) => r.collections);
}

export function getCategories(collectionId?: string) {
  return apiFetch<{ categories: Category[] }>(`/api/categories${qs({ collectionId })}`).then(
    (r) => r.categories
  );
}

export function getProducts(query: ProductListQuery = {}) {
  return apiFetch<ProductListResult>(
    `/api/products${qs({
      collectionId: query.collectionId,
      categoryId: query.categoryId,
      search: query.search,
      size: query.size,
      color: query.color,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    })}`
  );
}

export function getProduct(id: string) {
  return apiFetch<{ product: Product }>(`/api/products/${id}`).then((r) => r.product);
}

// ---- Cart ----

export function getCart() {
  return apiFetch<CartView>('/api/cart');
}

// ---- Orders ----

export function getMyOrders() {
  return apiFetch<{ orders: Order[] }>('/api/orders/mine').then((r) => r.orders);
}
