'use client';

import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import {
  QueryClientProvider,
  HydrationBoundary,
  type DehydratedState,
} from '@tanstack/react-query';
import { makeStore } from './store';
import { loggedOut } from './slices/authSlice';
import { makeQueryClient } from '@/lib/query-client';
import { subscribeAccessToken } from '@/lib/api/token';
import { useAuthBootstrap } from '@/hooks/use-auth';

// Runs the one-time session restore. Separate component so it sits *inside*
// both providers (it dispatches to the store and may read query cache later).
function AuthBootstrap() {
  useAuthBootstrap();
  return null;
}

// Client-boundary wrapper around the root layout's server component. Owns the
// two client-side singletons — the Redux store and the TanStack Query client —
// created exactly once per mount via useState's lazy initializer (per the RTK
// / React Query SSR guidance), never at module scope.
export function StoreProvider({
  children,
  dehydratedState,
}: {
  children: React.ReactNode;
  /** From the root layout's server-side `dehydrate(queryClient)` — primes the
   *  collections list so chrome renders without a skeleton flash. */
  dehydratedState?: DehydratedState;
}) {
  const [store] = useState(makeStore);
  const [queryClient] = useState(makeQueryClient);

  // If the access token drops to null outside a deliberate logout (e.g. the
  // refresh cookie expired mid-session and the client's silent retry failed),
  // reflect that in Redux and drop cached per-user data.
  useEffect(() => {
    return subscribeAccessToken((token) => {
      if (token === null && store.getState().auth.status === 'authenticated') {
        store.dispatch(loggedOut());
        queryClient.clear();
      }
    });
  }, [store, queryClient]);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          <AuthBootstrap />
          {children}
        </HydrationBoundary>
      </QueryClientProvider>
    </Provider>
  );
}
