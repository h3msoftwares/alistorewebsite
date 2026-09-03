import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

// Header-badge count only. The authoritative cart (line items, totals) lives
// in the TanStack Query cache — `useCart()` keeps this number in sync so the
// bag icon can read it via a cheap selector without subscribing to the query.
export interface CartState {
  itemCount: number;
}

const initialState: CartState = {
  itemCount: 0,
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    setItemCount(state, action: PayloadAction<number>) {
      state.itemCount = Math.max(0, Math.trunc(action.payload));
    },
    resetItemCount(state) {
      state.itemCount = 0;
    },
  },
});

export const { setItemCount, resetItemCount } = cartSlice.actions;
export default cartSlice.reducer;

export const selectCartCount = (s: RootState) => s.cart.itemCount;
