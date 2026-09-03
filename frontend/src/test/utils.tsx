import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeStore, type AppStore } from '@/store/store';

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
