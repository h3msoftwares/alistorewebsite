'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAppDispatch } from '@/store/hooks';
import { setItemCount } from '@/store/slices/cartSlice';
import type { CartView, UUID } from '@/lib/types';

const countItems = (cart: CartView | undefined) =>
  cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;

/** The authoritative cart. Also mirrors the line-item count into the Redux
 *  `cart` slice so the header badge updates without subscribing to the query. */
export function useCart(opts?: { enabled?: boolean }) {
  const dispatch = useAppDispatch();
  const query = useQuery({
    queryKey: queryKeys.cart.root(),
    queryFn: cartApi.getCart,
    enabled: opts?.enabled ?? true,
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

export function useUpdateCartItem() {
  return useCartMutation(({ itemId, quantity }: { itemId: UUID; quantity: number }) =>
    cartApi.updateCartItem(itemId, quantity)
  );
}

export function useRemoveCartItem() {
  return useCartMutation(({ itemId }: { itemId: UUID }) => cartApi.removeCartItem(itemId));
}

export function useClearCart() {
  return useCartMutation(() => cartApi.clearCart());
}
