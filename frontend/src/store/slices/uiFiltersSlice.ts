import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// UI-only filter state for department listing pages — no actual
// filtering/query-wiring against the product list yet (that's Week 2,
// T13). This just gives the filter controls somewhere to store selections.
export type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'relevance';

export interface UiFiltersState {
  sizes: string[];
  colors: string[];
  priceMin: number | null;
  priceMax: number | null;
  sort: SortOption;
}

const initialState: UiFiltersState = {
  sizes: [],
  colors: [],
  priceMin: null,
  priceMax: null,
  sort: 'newest',
};

const uiFiltersSlice = createSlice({
  name: 'uiFilters',
  initialState,
  reducers: {
    toggleSize(state, action: PayloadAction<string>) {
      const i = state.sizes.indexOf(action.payload);
      if (i === -1) state.sizes.push(action.payload);
      else state.sizes.splice(i, 1);
    },
    toggleColor(state, action: PayloadAction<string>) {
      const i = state.colors.indexOf(action.payload);
      if (i === -1) state.colors.push(action.payload);
      else state.colors.splice(i, 1);
    },
    setPriceRange(state, action: PayloadAction<{ min: number | null; max: number | null }>) {
      state.priceMin = action.payload.min;
      state.priceMax = action.payload.max;
    },
    setSort(state, action: PayloadAction<SortOption>) {
      state.sort = action.payload;
    },
    resetFilters() {
      return initialState;
    },
  },
});

export const { toggleSize, toggleColor, setPriceRange, setSort, resetFilters } = uiFiltersSlice.actions;
export default uiFiltersSlice.reducer;
