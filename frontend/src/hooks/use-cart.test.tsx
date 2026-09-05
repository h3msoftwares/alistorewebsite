import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper, makeGuestStore } from '@/test/utils';
import { selectCartCount } from '@/store/slices/cartSlice';
import { useCart, useAddToCart, useAddManyToCart, useClearCart } from './use-cart';

vi.mock('@/lib/api', () => ({
  cartApi: {
    getCart: vi.fn(),
    addCartItem: vi.fn(),
    updateCartItem: vi.fn(),
    removeCartItem: vi.fn(),
    clearCart: vi.fn(),
  },
}));

import { cartApi } from '@/lib/api';
const mockCart = vi.mocked(cartApi, true);

const cartWith = (...qtys: number[]) => ({
  items: qtys.map((q, i) => ({ id: `i${i}`, cartID: 'c', variantID: `v${i}`, quantity: q, variant: {} })),
  subtotal: 0,
});

beforeEach(() => vi.clearAllMocks());

describe('useCart', () => {
  it('fetches the cart and mirrors the line-item count into the redux badge', async () => {
    mockCart.getCart.mockResolvedValue(cartWith(2, 3) as never);
    const { Wrapper, store } = createWrapper(makeGuestStore());
    const { result } = renderHook(() => useCart(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(selectCartCount(store.getState())).toBe(5));
  });

  it('respects enabled:false', () => {
    const { Wrapper } = createWrapper(makeGuestStore());
    renderHook(() => useCart({ enabled: false }), { wrapper: Wrapper });
    expect(mockCart.getCart).not.toHaveBeenCalled();
  });
});

describe('cart mutations', () => {
  it('useAddToCart posts the variant + quantity then refetches and re-syncs the badge', async () => {
    mockCart.addCartItem.mockResolvedValue({ id: 'i1' } as never);
    mockCart.getCart.mockResolvedValueOnce(cartWith() as never).mockResolvedValue(cartWith(4) as never);

    const { Wrapper, store } = createWrapper(makeGuestStore());
    // an active useCart() gives invalidateQueries something to refetch
    const { result } = renderHook(() => ({ cart: useCart(), add: useAddToCart() }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.cart.isSuccess).toBe(true));
    expect(selectCartCount(store.getState())).toBe(0);

    await result.current.add.mutateAsync({ variantId: 'v1', quantity: 4 });

    expect(mockCart.addCartItem).toHaveBeenCalledWith('v1', 4);
    await waitFor(() => expect(mockCart.getCart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(selectCartCount(store.getState())).toBe(4));
  });

  it('useAddManyToCart attempts every line, resolves a per-line result, and re-syncs the badge once', async () => {
    mockCart.addCartItem
      .mockResolvedValueOnce({ id: 'a' } as never)
      .mockRejectedValueOnce(new Error('out of stock'))
      .mockResolvedValueOnce({ id: 'c' } as never);
    mockCart.getCart.mockResolvedValueOnce(cartWith() as never).mockResolvedValue(cartWith(1, 1) as never);

    const { Wrapper, store } = createWrapper(makeGuestStore());
    const { result } = renderHook(() => ({ cart: useCart(), bulk: useAddManyToCart() }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.cart.isSuccess).toBe(true));

    const outcome = await result.current.bulk.mutateAsync([
      { variantId: 'v1', key: 'p1' },
      { variantId: 'v2', key: 'p2' },
      { variantId: 'v3', key: 'p3' },
    ]);

    expect(mockCart.addCartItem).toHaveBeenCalledTimes(3);
    expect(outcome.map((r) => [r.key, r.ok])).toEqual([
      ['p1', true],
      ['p2', false],
      ['p3', true],
    ]);
    await waitFor(() => expect(selectCartCount(store.getState())).toBe(2));
  });

  it('useClearCart calls the DELETE endpoint', async () => {
    mockCart.clearCart.mockResolvedValue(undefined as never);
    mockCart.getCart.mockResolvedValue(cartWith() as never);
    const { Wrapper } = createWrapper(makeGuestStore());
    const { result } = renderHook(() => useClearCart(), { wrapper: Wrapper });

    await result.current.mutateAsync(undefined as never);
    expect(mockCart.clearCart).toHaveBeenCalledTimes(1);
  });
});
