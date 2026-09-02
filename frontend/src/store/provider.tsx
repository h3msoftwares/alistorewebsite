'use client';

import { useState } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from './store';

// Client-boundary wrapper, same precedent as ThemeProvider in
// components/theme-provider.tsx. Instantiates exactly one store per mount
// via useState's lazy initializer (guaranteed to run exactly once, unlike
// reading/writing a ref during render) — not module scope, per the RTK SSR
// guidance linked from store.ts's comment. The setter is intentionally
// unused: the store is never replaced after creation.
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(makeStore);
  return <Provider store={store}>{children}</Provider>;
}
