'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi, favouritesApi, isApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectFavouriteIds, setFavourites } from '@/store/slices/favouritesSlice';
import { useAuth } from '@/hooks/use-auth';
import type { Product, UUID } from '@/lib/types';

const LS_KEY = 'alistore:favourites';

function readLocalFavourites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocalFavourites(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(ids));
  } catch {
    /* private mode / quota — guest favourites just won't survive a reload */
  }
}

export interface UseFavourites {
  /** Hydrated favourited products, newest-first (server order for logged-in
   *  users; slice order for guests). */
  favourites: Product[];
  /** The favourited product ids — the fast thing to read for a heart button. */
  favouriteIds: string[];
  /** favouriteIds.length. Also mirrored into the `favourites` Redux slice so
   *  the topbar badge (`selectFavouritesCount`) stays correct. */
  count: number;
  /** O(1) membership check — safe to call once per product card. */
  isFavourited: (productId: UUID) => boolean;
  /** Add if absent, remove if present. Logged-in → `/api/favourites`; guest →
   *  Redux slice + localStorage. Fire-and-forget (guests are synchronous). */
  toggleFavourite: (productId: UUID) => void;
  /** Which auth path is in effect. */
  source: 'backend' | 'local';
  /** List loading (the `/api/favourites` query, or the per-id product fetches
   *  for guests). */
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  /** Product id of an in-flight toggle (logged-in only — guests resolve
   *  synchronously). `null` when idle. */
  pendingId: UUID | null;
}

/**
 * One interface over two very different sources of truth:
 *
 *  - **logged-in** → the `/api/favourites` endpoints, via TanStack Query
 *    (same shape/handling as `useCart`). The query result is mirrored into the
 *    `favourites` slice so the topbar badge is right without the topbar
 *    subscribing to the query.
 *  - **guest** → the existing `favourites` Redux slice, persisted to
 *    localStorage here (the slice itself stays storage-agnostic). Guests never
 *    touch the backend — the API requires auth.
 *
 * No guest→user merge on login: the two lists stay independent (flagged as a
 * separate decision, mirroring how cart's merge was its own task).
 */
export function useFavourites(): UseFavourites {
  const { isAuthenticated, status } = useAuth();
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  const guestIds = useAppSelector(selectFavouriteIds);

  // ---- logged-in: backend is the source of truth --------------------------
  const favQuery = useQuery({
    queryKey: queryKeys.favourites.root(),
    queryFn: favouritesApi.listFavourites,
    enabled: isAuthenticated,
  });

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: queryKeys.favourites.root() }),
    [qc]
  );
  const addMutation = useMutation({
    mutationFn: (productId: UUID) => favouritesApi.addFavourite(productId),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (productId: UUID) => favouritesApi.removeFavourite(productId),
    onSuccess: invalidate,
  });

  // ---- guest: local slice + localStorage ---------------------------------
  // Hydrate the slice from localStorage once the session is known to be a
  // guest (never during 'loading', so a logged-in reload doesn't flash the
  // guest list).
  useEffect(() => {
    if (status === 'guest') dispatch(setFavourites(readLocalFavourites()));
  }, [status, dispatch]);

  // Guests have only ids — fetch each product so the page can render cards.
  const guestProductQueries = useQueries({
    queries: (isAuthenticated ? [] : guestIds).map((id) => ({
      queryKey: queryKeys.products.detail(id),
      queryFn: () => catalogApi.getProduct(id),
      enabled: !isAuthenticated,
    })),
  });

  // A guest-local id whose product has since been deleted 404s here forever.
  // Prune it from the slice + localStorage (same path toggleFavourite uses) so
  // count/badge converge on their own. Only on a confirmed 404 — a flaky or
  // network error must not silently unfavourite something.
  useEffect(() => {
    if (isAuthenticated) return;
    const deadSet = new Set(
      guestIds.filter((_, i) => {
        const q = guestProductQueries[i];
        return !!q && q.isError && isApiError(q.error) && q.error.status === 404;
      })
    );
    if (deadSet.size === 0) return;
    const next = guestIds.filter((id) => !deadSet.has(id));
    dispatch(setFavourites(next));
    writeLocalFavourites(next);
  }, [isAuthenticated, guestIds, guestProductQueries, dispatch]);

  // ---- unified view ------------------------------------------------------
  const favourites = useMemo<Product[]>(() => {
    if (isAuthenticated) return favQuery.data?.map((e) => e.product) ?? [];
    return guestProductQueries
      .map((q) => q.data)
      .filter((p): p is Product => Boolean(p));
  }, [isAuthenticated, favQuery.data, guestProductQueries]);

  const favouriteIds = useMemo<string[]>(() => {
    if (isAuthenticated) return favQuery.data?.map((e) => e.product.id) ?? [];
    return guestIds;
  }, [isAuthenticated, favQuery.data, guestIds]);

  const idSet = useMemo(() => new Set(favouriteIds), [favouriteIds]);

  // Keep the badge slice in step with the backend list for logged-in users
  // (guests already own the slice directly).
  useEffect(() => {
    if (isAuthenticated && favQuery.data) {
      dispatch(setFavourites(favQuery.data.map((e) => e.product.id)));
    }
  }, [isAuthenticated, favQuery.data, dispatch]);

  const toggleFavourite = useCallback(
    (productId: UUID) => {
      if (isAuthenticated) {
        if (idSet.has(productId)) removeMutation.mutate(productId);
        else addMutation.mutate(productId);
        return;
      }
      const next = guestIds.includes(productId)
        ? guestIds.filter((x) => x !== productId)
        : [...guestIds, productId];
      dispatch(setFavourites(next));
      writeLocalFavourites(next);
    },
    [isAuthenticated, idSet, guestIds, addMutation, removeMutation, dispatch]
  );

  const isFavourited = useCallback((id: UUID) => idSet.has(id), [idSet]);

  const refetch = useCallback(() => {
    if (isAuthenticated) void favQuery.refetch();
    else guestProductQueries.forEach((q) => void q.refetch());
  }, [isAuthenticated, favQuery, guestProductQueries]);

  const guestPending =
    !isAuthenticated && guestIds.length > 0 && guestProductQueries.some((q) => q.isLoading);
  const pendingId =
    (addMutation.isPending && addMutation.variables) ||
    (removeMutation.isPending && removeMutation.variables) ||
    null;

  return {
    favourites,
    favouriteIds,
    count: idSet.size,
    isFavourited,
    toggleFavourite,
    source: isAuthenticated ? 'backend' : 'local',
    isPending: status === 'loading' || (isAuthenticated ? favQuery.isLoading : guestPending),
    // For guests a single dud id (e.g. a since-deleted product) is just dropped
    // from the list — only surface an error if every lookup failed.
    isError: isAuthenticated
      ? favQuery.isError
      : guestProductQueries.length > 0 && guestProductQueries.every((q) => q.isError),
    refetch,
    pendingId,
  };
}
