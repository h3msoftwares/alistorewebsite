import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ProductListQuery, ProductSort } from '@/lib/types';
import type { RootState } from '../store';

// Drives the product-listing query string. Field names / values match the
// backend `GET /api/products` params 1:1 (see product.schema.ts) so the
// selector below maps straight through.
export type SortOption = ProductSort; // 'newest' | 'price_asc' | 'price_desc'

export interface UiFiltersState {
  categoryId: string | null;
  size: string | null;
  color: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  /** Show only products discounted right now (own sale or a catalog discount). */
  onSale: boolean;
  sort: SortOption;
  search: string;
  page: number;
}

const initialState: UiFiltersState = {
  categoryId: null,
  size: null,
  color: null,
  minPrice: null,
  maxPrice: null,
  onSale: false,
  sort: 'newest',
  search: '',
  page: 1,
};

const uiFiltersSlice = createSlice({
  name: 'uiFilters',
  initialState,
  reducers: {
    setCategory(state, action: PayloadAction<string | null>) {
      state.categoryId = action.payload;
      state.page = 1;
    },
    // Single-select (backend takes one size / one colour); clicking the active
    // value clears it.
    toggleSize(state, action: PayloadAction<string>) {
      state.size = state.size === action.payload ? null : action.payload;
      state.page = 1;
    },
    toggleColor(state, action: PayloadAction<string>) {
      state.color = state.color === action.payload ? null : action.payload;
      state.page = 1;
    },
    // Absolute set (used by the <select> filters); null clears.
    setSize(state, action: PayloadAction<string | null>) {
      state.size = action.payload || null;
      state.page = 1;
    },
    setColor(state, action: PayloadAction<string | null>) {
      state.color = action.payload || null;
      state.page = 1;
    },
    setPriceRange(state, action: PayloadAction<{ min: number | null; max: number | null }>) {
      state.minPrice = action.payload.min;
      state.maxPrice = action.payload.max;
      state.page = 1;
    },
    setOnSale(state, action: PayloadAction<boolean>) {
      state.onSale = action.payload;
      state.page = 1;
    },
    setSort(state, action: PayloadAction<SortOption>) {
      state.sort = action.payload;
      state.page = 1;
    },
    setSearch(state, action: PayloadAction<string>) {
      state.search = action.payload;
      state.page = 1;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = Math.max(1, Math.trunc(action.payload));
    },
    resetFilters() {
      return initialState;
    },
  },
});

export const {
  setCategory,
  toggleSize,
  toggleColor,
  setSize,
  setColor,
  setPriceRange,
  setOnSale,
  setSort,
  setSearch,
  setPage,
  resetFilters,
} = uiFiltersSlice.actions;

export default uiFiltersSlice.reducer;

// ---- selectors ----
export const selectUiFilters = (s: RootState) => s.uiFilters;

/**
 * Turns filter state into a `GET /api/products` query object, dropping empty
 * values. Pass the page's collection id to scope it.
 *
 * Deliberately a plain function over an already-selected `UiFiltersState`,
 * not a Redux selector over the whole store — it used to be
 * `(collectionId) => (state) => {...}`, called directly as
 * `useAppSelector(selectProductListQuery(collectionId))`. That allocated a
 * brand-new object on every single call (own spreads, no memoization), and
 * since callers already separately read `selectUiFilters` in the same
 * component, it was a second, redundant store read on top of being
 * unmemoized. React-Redux calls a selector more than once per render to
 * check for tearing; two calls with the same state each returning a
 * different object reference is exactly what triggered "Selector unknown
 * returned a different result when called with the same parameters" —
 * confirmed live on both /category/:slug and /:collection.
 *
 * Callers now derive the query with `useMemo(() => buildProductListQuery(filters,
 * collectionId), [filters, collectionId])` from the `filters` they already
 * have, instead of a second store subscription.
 */
export function buildProductListQuery(f: UiFiltersState, collectionId?: string): ProductListQuery {
  return {
    ...(collectionId ? { collectionId } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.search ? { search: f.search } : {}),
    ...(f.size ? { size: f.size } : {}),
    ...(f.color ? { color: f.color } : {}),
    ...(f.minPrice != null ? { minPrice: f.minPrice } : {}),
    ...(f.maxPrice != null ? { maxPrice: f.maxPrice } : {}),
    ...(f.onSale ? { onSale: true } : {}),
    sort: f.sort,
    page: f.page,
  };
}
