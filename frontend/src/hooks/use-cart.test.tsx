import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { selectCartCount } from '@/store/slices/cartSlice';
import { useCart, useAddToCart, useClearCart } from './use-cart';

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
    const { Wrapper, store } = createWrapper();
    const { result } = renderHook(() => useCart(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(selectCartCount(store.getState())).toBe(5));
  });

  it('respects enabled:false', () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useCart({ enabled: false }), { wrapper: Wrapper });
    expect(mockCart.getCart).not.toHaveBeenCalled();
  });
});

describe('cart mutations', () => {
  it('useAddToCart posts the variant + quantity then refetches and re-syncs the badge', async () => {
    mockCart.addCartItem.mockResolvedValue({ id: 'i1' } as never);
    mockCart.getCart.mockResolvedValueOnce(cartWith() as never).mockResolvedValue(cartWith(4) as never);

    const { Wrapper, store } = createWrapper();
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

  it('useClearCart calls the DELETE endpoint', async () => {
    mockCart.clearCart.mockResolvedValue(undefined as never);
    mockCart.getCart.mockResolvedValue(cartWith() as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useClearCart(), { wrapper: Wrapper });

    await result.current.mutateAsync(undefined as never);
    expect(mockCart.clearCart).toHaveBeenCalledTimes(1);
  });
});
