import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { queryKeys } from '@/lib/query-keys';
import { setItemCount, selectCartCount } from '@/store/slices/cartSlice';
import {
  useMyOrders,
  useOrder,
  useCheckout,
  useCancelOrder,
  useUpdateOrderStatus,
} from './use-orders';

vi.mock('@/lib/api', () => ({
  ordersApi: {
    checkout: vi.fn(),
    listMyOrders: vi.fn(),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
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
