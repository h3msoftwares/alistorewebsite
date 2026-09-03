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
    setPriceRange(state, action: PayloadAction<{ min: number | null; max: number | null }>) {
      state.minPrice = action.payload.min;
      state.maxPrice = action.payload.max;
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
  setPriceRange,
  setSort,
  setSearch,
  setPage,
  resetFilters,
} = uiFiltersSlice.actions;

export default uiFiltersSlice.reducer;

// ---- selectors ----
export const selectUiFilters = (s: RootState) => s.uiFilters;

/** Turn the current filter state into a `GET /api/products` query object,
 *  dropping empty values. Pass the page's collection id to scope it. */
export const selectProductListQuery =
  (collectionId?: string) =>
  (s: RootState): ProductListQuery => {
    const f = s.uiFilters;
    return {
      ...(collectionId ? { collectionId } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.search ? { search: f.search } : {}),
      ...(f.size ? { size: f.size } : {}),
      ...(f.color ? { color: f.color } : {}),
      ...(f.minPrice != null ? { minPrice: f.minPrice } : {}),
      ...(f.maxPrice != null ? { maxPrice: f.maxPrice } : {}),
      sort: f.sort,
      page: f.page,
    };
  };
