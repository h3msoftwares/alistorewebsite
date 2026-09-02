import { configureStore } from '@reduxjs/toolkit';
import cartReducer from './slices/cartSlice';
import uiFiltersReducer from './slices/uiFiltersSlice';

// Factory, not a module-level `export const store = configureStore(...)`
// singleton — Next.js App Router renders client components on the server
// too, and a module-scoped store would leak state across concurrent
// requests. StoreProvider below calls this once per mount via useRef.
export function makeStore() {
  return configureStore({
    reducer: {
      cart: cartReducer,
      uiFilters: uiFiltersReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
