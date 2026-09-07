import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { queryKeys } from '@/lib/query-keys';
import { setItemCount, selectCartCount } from '@/store/slices/cartSlice';
import {
  useMyOrders,
  useOrder,
  useOrderByToken,
  useCheckout,
  useCancelOrder,
  useCancelOrderByToken,
  useLookupOrder,
  useDeliveryQuote,
  useUpdateOrderStatus,
} from './use-orders';

vi.mock('@/lib/api', () => ({
  ordersApi: {
    checkout: vi.fn(),
    getDeliveryQuote: vi.fn(),
    listMyOrders: vi.fn(),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    getOrderByToken: vi.fn(),
    cancelOrderByToken: vi.fn(),
    lookupOrder: vi.fn(),
    adminListOrders: vi.fn(),
    adminUpdateOrderStatus: vi.fn(),
    adminMarkCollected: vi.fn(),
    adminDashboard: vi.fn(),
    adminUpdateVariantStock: vi.fn(),
  },
}));

import { ordersApi } from '@/lib/api';
const mockOrders = vi.mocked(ordersApi, true);

beforeEach(() => vi.clearAllMocks());

describe('order queries', () => {
  it('useMyOrders fetches the list', async () => {
    mockOrders.listMyOrders.mockResolvedValue([{ id: 'o1' }] as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMyOrders(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'o1' }]));
  });

  it('useOrder is gated on the id', async () => {
    mockOrders.getOrder.mockResolvedValue({ id: 'o1' } as never);
    const { Wrapper } = createWrapper();
    renderHook(() => useOrder(undefined), { wrapper: Wrapper });
    expect(mockOrders.getOrder).not.toHaveBeenCalled();
  });
});

describe('useCheckout', () => {
  it('places the order, empties the cart cache + badge, and refreshes orders', async () => {
    mockOrders.checkout.mockResolvedValue({
      id: 'o5',
      orderNumber: 'AS-0005',
      total: 42,
      items: [],
    } as never);
    const { Wrapper, store, queryClient } = createWrapper();
    store.dispatch(setItemCount(3));
    const spy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCheckout(), { wrapper: Wrapper });
    await result.current.mutateAsync({
      deliveryName: 'A',
      deliveryPhone: '079',
      deliveryAddress: 'street',
      deliveryCity: 'Amman',
      deliveryRegion: 'BEIRUT',
    });

    expect(mockOrders.checkout).toHaveBeenCalled();
    expect(selectCartCount(store.getState())).toBe(0);
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(queryKeys.cart.root());
    expect(keys).toContainEqual(queryKeys.orders.all());
  });
});

describe('useCancelOrder', () => {
  it('writes the returned order into the detail cache', async () => {
    mockOrders.cancelOrder.mockResolvedValue({ id: 'o7', status: 'CANCELLED' } as never);
    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useCancelOrder(), { wrapper: Wrapper });

    await result.current.mutateAsync('o7');
    expect(queryClient.getQueryData(queryKeys.orders.detail('o7'))).toMatchObject({
      status: 'CANCELLED',
    });
  });
});

describe('guest tracking hooks', () => {
  it('useOrderByToken is gated on the token, then fetches by it', async () => {
    mockOrders.getOrderByToken.mockResolvedValue({ id: 'o9' } as never);
    const { Wrapper } = createWrapper();
    const { result, rerender } = renderHook(({ token }) => useOrderByToken(token), {
      wrapper: Wrapper,
      initialProps: { token: undefined as string | undefined },
    });
    expect(mockOrders.getOrderByToken).not.toHaveBeenCalled();

    rerender({ token: 'tok123' });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'o9' }));
    expect(mockOrders.getOrderByToken).toHaveBeenCalledWith('tok123');
  });

  it('useCancelOrderByToken writes the returned order into the track cache', async () => {
    mockOrders.cancelOrderByToken.mockResolvedValue({ id: 'o9', status: 'CANCELLED' } as never);
    const { Wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useCancelOrderByToken(), { wrapper: Wrapper });

    await result.current.mutateAsync('tok123');
    expect(queryClient.getQueryData(queryKeys.orders.track('tok123'))).toMatchObject({ status: 'CANCELLED' });
  });

  it('useLookupOrder resolves to the freshly minted token', async () => {
    mockOrders.lookupOrder.mockResolvedValue('fresh-token');
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useLookupOrder(), { wrapper: Wrapper });

    const token = await result.current.mutateAsync({ orderNumber: 'AS-1', contact: 'a@test.dev' });
    expect(token).toBe('fresh-token');
    expect(mockOrders.lookupOrder).toHaveBeenCalledWith('AS-1', 'a@test.dev');
  });
});

describe('useDeliveryQuote', () => {
  it('stays idle until a region is given, then fetches the quote', async () => {
    mockOrders.getDeliveryQuote.mockResolvedValue({
      subtotal: 40,
      deliveryFee: 3,
      total: 43,
      freeReason: null,
    } as never);
    const { Wrapper } = createWrapper();

    const { result, rerender } = renderHook(({ region }) => useDeliveryQuote(region), {
      wrapper: Wrapper,
      initialProps: { region: null as string | null },
    });
    expect(mockOrders.getDeliveryQuote).not.toHaveBeenCalled();

    rerender({ region: 'BEIRUT' });
    await waitFor(() => expect(result.current.data?.total).toBe(43));
    expect(mockOrders.getDeliveryQuote).toHaveBeenCalledWith('BEIRUT');
  });
});

describe('useUpdateOrderStatus (admin)', () => {
  it('calls the admin endpoint and refreshes the dashboard', async () => {
    mockOrders.adminUpdateOrderStatus.mockResolvedValue({ id: 'o1', status: 'DELIVERED' } as never);
    const { Wrapper, queryClient } = createWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateOrderStatus(), { wrapper: Wrapper });

    await result.current.mutateAsync({ id: 'o1', status: 'DELIVERED' });

    expect(mockOrders.adminUpdateOrderStatus).toHaveBeenCalledWith('o1', 'DELIVERED');
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toContainEqual(queryKeys.orders.dashboard());
  });
});
