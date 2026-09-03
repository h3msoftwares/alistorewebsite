import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

// Structure only. Holds the product ids the shopper has hearted. TODO: persist
// (localStorage for guests, a backend wishlist table once schema §4.1 lands)
// and hydrate on boot.
export interface FavouritesState {
  ids: string[];
}

const initialState: FavouritesState = {
  ids: [],
};

const favouritesSlice = createSlice({
  name: 'favourites',
  initialState,
  reducers: {
    toggleFavourite(state, action: PayloadAction<string>) {
      const i = state.ids.indexOf(action.payload);
      if (i === -1) state.ids.push(action.payload);
      else state.ids.splice(i, 1);
    },
    setFavourites(state, action: PayloadAction<string[]>) {
      state.ids = Array.from(new Set(action.payload));
    },
    clearFavourites(state) {
      state.ids = [];
    },
  },
});

export const { toggleFavourite, setFavourites, clearFavourites } = favouritesSlice.actions;
export default favouritesSlice.reducer;

export const selectFavouriteIds = (s: RootState) => s.favourites.ids;
export const selectFavouritesCount = (s: RootState) => s.favourites.ids.length;
export const selectIsFavourite = (id: string) => (s: RootState) => s.favourites.ids.includes(id);
