'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { trackPurchase } from '@/lib/analytics/ga';
import { useAppDispatch } from '@/store/hooks';
import { resetItemCount } from '@/store/slices/cartSlice';
import type { CheckoutBody, OrderStatus, UUID } from '@/lib/types';

// ---------------------------------------------------------------- queries ----

export function useMyOrders(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.orders.mine(),
    queryFn: ordersApi.listMyOrders,
    enabled: opts?.enabled ?? true,
  });
}

export function useOrder(id: UUID | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id ?? ''),
    queryFn: () => ordersApi.getOrder(id as UUID),
    enabled: Boolean(id),
  });
}

export function useAdminOrders(status?: OrderStatus, flagged?: boolean) {
  return useQuery({
    queryKey: queryKeys.orders.admin(status, flagged),
    queryFn: () => ordersApi.adminListOrders(status, flagged),
  });
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: queryKeys.orders.dashboard(),
    queryFn: ordersApi.adminDashboard,
  });
}

/** Live delivery-fee estimate for the current cart + a chosen governorate;
 *  idle until a region is picked. */
export function useDeliveryQuote(region: string | null) {
  return useQuery({
    queryKey: ['orders', 'delivery-quote', region],
    queryFn: () => ordersApi.getDeliveryQuote(region!),
    enabled: Boolean(region),
    staleTime: 60_000,
  });
}

// -------------------------------------------------------------- mutations ----

export function useCheckout() {
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: (body: CheckoutBody) => ordersApi.checkout(body),
    onSuccess: (order) => {
      trackPurchase({
        transactionId: order.orderNumber,
        value: Number(order.total),
        items: (order.items ?? []).map((oi) => ({
          item_id: oi.productSKU,
          item_name: oi.productName,
          price: Number(oi.unitPrice),
          item_variant: [oi.size, oi.color].filter(Boolean).join(' / ') || undefined,
          quantity: oi.quantity,
        })),
      });
      // Checkout empties the cart server-side.
      qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
      // A new address may have been saved to the book during checkout.
      qc.invalidateQueries({ queryKey: queryKeys.addresses.all() });
      dispatch(resetItemCount());
    },
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => ordersApi.cancelOrder(id),
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.orders.detail(order.id), order);
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
    },
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: UUID; status: OrderStatus }) =>
      ordersApi.adminUpdateOrderStatus(id, status),
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.orders.detail(order.id), order);
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
      qc.invalidateQueries({ queryKey: queryKeys.orders.dashboard() });
    },
  });
}

export function useMarkOrderCollected() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, collected }: { id: UUID; collected: boolean }) =>
      ordersApi.adminMarkCollected(id, collected),
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.orders.detail(order.id), order);
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
      // dashboard "Awaiting COD" tile
      qc.invalidateQueries({ queryKey: queryKeys.orders.dashboard() });
    },
  });
}

export function useReviewOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => ordersApi.adminReviewOrder(id),
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.orders.detail(order.id), order);
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
      // dashboard "Flagged for review" tile
      qc.invalidateQueries({ queryKey: queryKeys.orders.dashboard() });
    },
  });
}

export function useUpdateVariantStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, stockQuantity }: { variantId: UUID; stockQuantity: number }) =>
      ordersApi.adminUpdateVariantStock(variantId, stockQuantity),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.products.all() });
      // dashboard "Low / out of stock" tile
      qc.invalidateQueries({ queryKey: queryKeys.orders.dashboard() });
    },
  });
}
