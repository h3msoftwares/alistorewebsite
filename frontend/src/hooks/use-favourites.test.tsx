import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { makeStore } from '@/store/store';
import { loggedOut } from '@/store/slices/authSlice';
import { setFavourites } from '@/store/slices/favouritesSlice';
import { useFavourites } from './use-favourites';

// Keep ApiError / isApiError real (the prune logic branches on `status === 404`);
// only the network-touching api objects are stubbed.
vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    catalogApi: { getProduct: vi.fn() },
    favouritesApi: { listFavourites: vi.fn(), addFavourite: vi.fn(), removeFavourite: vi.fn() },
  };
});

import { catalogApi, ApiError } from '@/lib/api';
const mockCatalog = vi.mocked(catalogApi, true);

const LS_KEY = 'alistore:favourites';

const liveProduct = (id: string) =>
  ({ id, nameEn: 'Live', nameAr: 'حي', price: '10', images: [], variants: [] }) as never;

/** A store already in the guest state, with `ids` seeded into both the slice
 *  and localStorage (the two things the guest path reads). */
function guestStore(ids: string[]) {
  const store = makeStore();
  store.dispatch(loggedOut());
  window.localStorage.setItem(LS_KEY, JSON.stringify(ids));
  store.dispatch(setFavourites(ids));
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('useFavourites — guest dead-id pruning', () => {
  it('removes a locally-favourited id whose product lookup 404s, keeping the live ones', async () => {
    const store = guestStore(['p-alive', 'p-dead']);
    mockCatalog.getProduct.mockImplementation((id: string) =>
      id === 'p-dead'
        ? Promise.reject(new ApiError(404, { code: 'NOT_FOUND', message: 'Product not found' }))
        : Promise.resolve(liveProduct(id))
    );

    const { Wrapper } = createWrapper(store);
    const { result } = renderHook(() => useFavourites(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.favouriteIds).toEqual(['p-alive']);
      expect(result.current.count).toBe(1);
    });
    // localStorage is rewritten the same way toggleFavourite persists changes.
    expect(JSON.parse(window.localStorage.getItem(LS_KEY)!)).toEqual(['p-alive']);
  });

  it('does not prune on a non-404 error (a flaky request must not unfavourite)', async () => {
    const store = guestStore(['p-ok', 'p-flaky']);
    mockCatalog.getProduct.mockImplementation((id: string) =>
      id === 'p-flaky'
        ? Promise.reject(new ApiError(500, { code: 'INTERNAL', message: 'boom' }))
        : Promise.resolve(liveProduct(id))
    );

    const { Wrapper } = createWrapper(store);
    const { result } = renderHook(() => useFavourites(), { wrapper: Wrapper });

    // both lookups have settled (one resolved, one 500'd) — a prune, if it were
    // going to happen, would have by now.
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.favouriteIds).toEqual(['p-ok', 'p-flaky']);
    expect(result.current.count).toBe(2);
    expect(JSON.parse(window.localStorage.getItem(LS_KEY)!)).toEqual(['p-ok', 'p-flaky']);
  });
});
