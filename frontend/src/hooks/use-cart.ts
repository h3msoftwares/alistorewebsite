'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setItemCount } from '@/store/slices/cartSlice';
import { selectAuthStatus } from '@/store/slices/authSlice';
import type { CartView, UUID } from '@/lib/types';

const countItems = (cart: CartView | undefined) =>
  cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;

/** The authoritative cart. Also mirrors the line-item count into the Redux
 *  `cart` slice so the header badge updates without subscribing to the query.
 *
 *  Held off (`enabled`) until the auth bootstrap resolves (`status !==
 *  'loading'`, whether that lands on 'guest' or 'authenticated') — the cart is
 *  fetched *as* whichever owner is true, guest cookie or Bearer token. Firing
 *  before that resolves would race the token: it goes out with no
 *  Authorization header, so a logged-in shopper gets back a fresh empty guest
 *  cart, and nothing would later refetch it once the token actually lands
 *  (auth state changing doesn't itself invalidate this query) — the header
 *  badge and cart page/drawer would just be silently wrong on any page load
 *  where bootstrap hasn't finished yet. Since CartDrawer now mounts this on
 *  every page (not just /cart), that race went from rare to routine. */
export function useCart(opts?: { enabled?: boolean }) {
  const dispatch = useAppDispatch();
  const authStatus = useAppSelector(selectAuthStatus);
  const query = useQuery({
    queryKey: queryKeys.cart.root(),
    queryFn: cartApi.getCart,
    enabled: (opts?.enabled ?? true) && authStatus !== 'loading',
    // Every consumer (CartDrawer, the /cart page) reads `.items` assuming
    // it's always an array, per the CartView contract — but that's only a
    // compile-time guarantee, not a runtime one. Normalized here, once,
    // rather than defensively re-guarding `data.items` in each consumer.
    select: (data): CartView => ({ ...data, items: data.items ?? [] }),
  });

  useEffect(() => {
    if (query.data) dispatch(setItemCount(countItems(query.data)));
  }, [query.data, dispatch]);

  return query;
}

function useCartMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
      const fresh = qc.getQueryData<CartView>(queryKeys.cart.root());
      if (fresh) dispatch(setItemCount(countItems(fresh)));
    },
  });
}

export function useAddToCart() {
  return useCartMutation(({ variantId, quantity = 1 }: { variantId: UUID; quantity?: number }) =>
    cartApi.addCartItem(variantId, quantity)
  );
}

export interface BulkAddLine {
  variantId: UUID;
  quantity?: number;
  /** Echoed back on the per-line result so the caller can map an outcome to
   *  its product row without re-deriving it from the variant id. */
  key?: string;
}
export interface BulkAddResult {
  variantId: UUID;
  key?: string;
  ok: boolean;
  error: unknown;
}

/** Add several variants in one go (favourites → cart). Each line is attempted
 *  independently — one out-of-stock line doesn't sink the rest — and the cart
 *  query is invalidated (and the badge re-synced) once, after all settle. The
 *  mutation resolves to a per-line `BulkAddResult[]`; it only rejects if the
 *  whole batch was empty of successes AND every line errored, so callers
 *  should read the resolved array rather than relying on `isError`. */
export function useAddManyToCart() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: async (lines: BulkAddLine[]): Promise<BulkAddResult[]> => {
      const settled = await Promise.allSettled(
        lines.map((l) => cartApi.addCartItem(l.variantId, l.quantity ?? 1))
      );
      return settled.map((r, i) => ({
        variantId: lines[i].variantId,
        key: lines[i].key,
        ok: r.status === 'fulfilled',
        error: r.status === 'rejected' ? r.reason : null,
      }));
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
      const fresh = qc.getQueryData<CartView>(queryKeys.cart.root());
      if (fresh) dispatch(setItemCount(countItems(fresh)));
    },
  });
}

/** `quantity` and/or `variantId` (size/color change) — see lib/api/cart.ts.
 *  Same invalidate-and-refetch as every other cart mutation, so a variant
 *  change that merges into (and deletes) a different line is picked up
 *  automatically — nothing here needs to track the old item id. */
export function useUpdateCartItem() {
  return useCartMutation(
    ({ itemId, quantity, variantId }: { itemId: UUID; quantity?: number; variantId?: UUID }) =>
      cartApi.updateCartItem(itemId, { quantity, variantId })
  );
}

export function useRemoveCartItem() {
  return useCartMutation(({ itemId }: { itemId: UUID }) => cartApi.removeCartItem(itemId));
}

export function useClearCart() {
  return useCartMutation(() => cartApi.clearCart());
}
