'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { trackPurchase } from '@/lib/analytics/ga';
import { useAppDispatch } from '@/store/hooks';
import { resetItemCount } from '@/store/slices/cartSlice';
import type { CheckoutBody, CollectionInput, OrderStatus, OrderReturnFilter, UUID } from '@/lib/types';

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

export function useCollectionSummary(id: UUID, enabled = true) {
  return useQuery({ queryKey: queryKeys.orders.collections(id), queryFn: () => ordersApi.adminCollectionSummary(id), enabled });
}

export function useOrderByToken(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.track(token ?? ''),
    queryFn: () => ordersApi.getOrderByToken(token as string),
    enabled: Boolean(token),
    retry: false, // a bad/expired token 404s — retrying won't change that
  });
}

export function useAdminOrders(status?: OrderStatus[], flagged?: boolean, awaitingCod?: boolean, returnFilter?: OrderReturnFilter) {
  return useQuery({
    queryKey: queryKeys.orders.admin(status, flagged, awaitingCod, returnFilter),
    queryFn: () => ordersApi.adminListOrders(status, flagged, awaitingCod, returnFilter),
  });
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: queryKeys.orders.dashboard(),
    queryFn: ordersApi.adminDashboard,
  });
}

export function useReturnWorkSummary(enabled = true) {
  return useQuery({ queryKey: queryKeys.orders.returnWork(), queryFn: ordersApi.adminReturnWork, enabled });
}

/** Live delivery-fee estimate for the current cart + a chosen governorate;
 *  idle until a region is picked. */
export function useDeliveryQuote(region: string | null, couponCode?: string, pricingMode?: 'BUNDLE' | 'COUPON', cartSignature?: string) {
  return useQuery({
    queryKey: ['orders', 'delivery-quote', region, couponCode ?? null, pricingMode ?? null, cartSignature ?? null],
    queryFn: () => ordersApi.getDeliveryQuote(region!, couponCode, pricingMode),
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

export function useCancelOrderByToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => ordersApi.cancelOrderByToken(token),
    onSuccess: (order, token) => {
      qc.setQueryData(queryKeys.orders.track(token), order);
    },
  });
}

/** POST /api/orders/lookup — resolves to the freshly minted tracking token
 *  on a match; the caller navigates to /orders/track/[token]. */
export function useLookupOrder() {
  return useMutation({
    mutationFn: ({ orderNumber, contact }: { orderNumber: string; contact: string }) =>
      ordersApi.lookupOrder(orderNumber, contact),
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      estimatedDeliveryDays,
    }: {
      id: UUID;
      status: OrderStatus;
      estimatedDeliveryDays?: number | null;
    }) => ordersApi.adminUpdateOrderStatus(id, status, estimatedDeliveryDays),
    onSuccess: () => {
      // Keep read-time indicators until the complete detail query refreshes.
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
      qc.invalidateQueries({ queryKey: queryKeys.orders.dashboard() });
      qc.invalidateQueries({ queryKey: queryKeys.returns.all() });
      qc.invalidateQueries({ queryKey: queryKeys.analytics.all() });
    },
  });
}

export function useMarkOrderCollected() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: CollectionInput }) =>
      ordersApi.adminMarkCollected(id, body),
    onSuccess: () => {
      // This mutation returns scalar fields only. Keep the complete cached
      // order visible until the detail query reloads its items and returns.
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
      // dashboard "Awaiting COD" tile
      qc.invalidateQueries({ queryKey: queryKeys.orders.dashboard() });
      qc.invalidateQueries({ queryKey: queryKeys.returns.all() });
    },
  });
}

export function useCorrectOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: UUID; status: OrderStatus; expectedStatus: OrderStatus; reason: string }) =>
      ordersApi.adminCorrectOrderStatus(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
      qc.invalidateQueries({ queryKey: queryKeys.returns.all() });
      qc.invalidateQueries({ queryKey: queryKeys.analytics.all() });
    },
  });
}

export function useReviewOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => ordersApi.adminReviewOrder(id),
    onSuccess: () => {
      // The review response has no items/returns relations; it is not a
      // replacement for the full detail query's result.
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
