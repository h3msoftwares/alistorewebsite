import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Badge-count-only for now — real cart line items/totals land in Week 3
// (see Alistore_Sprint_Plan.md T22-T24). This slice exists purely so the
// header cart icon has somewhere to read a count from once it's wired up.
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
      state.itemCount = action.payload;
    },
    resetItemCount(state) {
      state.itemCount = 0;
    },
  },
});

export const { setItemCount, resetItemCount } = cartSlice.actions;
export default cartSlice.reducer;
