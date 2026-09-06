import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeStore, type AppStore } from '@/store/store';
import { authenticated, loggedOut } from '@/store/slices/authSlice';
import type { AuthUser } from '@/lib/types';

/** A Redux + React Query wrapper for `renderHook` / `render`, with retries
 *  off so failing mocks surface immediately. */
export function createWrapper(store: AppStore = makeStore()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </Provider>
    );
  }

  return { store, queryClient, Wrapper };
}

/** A store with auth already resolved to 'guest' (not the real initial
 *  'loading') — for tests of anything gated on auth having settled (e.g.
 *  useCart, which holds off fetching until bootstrap resolves either way). */
export function makeGuestStore(): AppStore {
  const store = makeStore();
  store.dispatch(loggedOut());
  return store;
}

/** A store with auth resolved to a signed-in CUSTOMER — for tests of flows
 *  that branch on `isAuthenticated`. */
export function makeAuthedStore(user?: Partial<AuthUser>): AppStore {
  const store = makeStore();
  store.dispatch(
    authenticated({
      id: 'u1',
      name: 'Ali Customer',
      email: 'ali@test.dev',
      role: 'CUSTOMER',
      ...user,
    } as AuthUser)
  );
  return store;
}
