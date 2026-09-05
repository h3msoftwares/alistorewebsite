import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeGuestStore } from '@/test/utils';
import { FavouritesView } from './favourites-view';

vi.mock('next/image', () => ({
  default: ({ src, alt }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src as string} alt={alt as string} />
  ),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

vi.mock('@/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/api')>();
  return {
    ...actual,
    cartApi: {
      getCart: vi.fn(),
      addCartItem: vi.fn().mockResolvedValue({ id: 'ci' }),
      updateCartItem: vi.fn(),
      removeCartItem: vi.fn(),
      clearCart: vi.fn(),
    },
  };
});

const favState = {
  favourites: [] as unknown[],
  count: 0,
  favouriteIds: [] as string[],
  isFavourited: () => false,
  toggleFavourite: vi.fn(),
  source: 'local' as const,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
  pendingId: null as string | null,
};
vi.mock('@/hooks/use-favourites', () => ({ useFavourites: () => favState }));

import { cartApi } from '@/lib/api';
const mockCart = vi.mocked(cartApi, true);

const makeProduct = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  nameEn: 'Satin Nightgown',
  nameAr: 'قميص نوم',
  price: '32',
  compareAtPrice: null,
  onSale: false,
  effectivePrice: 32,
  images: [{ id: 'im1', url: 'http://img.test/n.jpg', altEn: null, altAr: null, color: null, sortOrder: 0 }],
  variants: [{ id: 'v1', productID: 'p1', sku: 'SKU1', size: 'M', color: 'Rose', stockQuantity: 5 }],
  ...over,
});

const renderView = (locale: 'en' | 'ar' = 'en') => {
  const { Wrapper } = createWrapper(makeGuestStore());
  return render(<FavouritesView locale={locale} />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(favState, {
    favourites: [],
    count: 0,
    favouriteIds: [],
    isPending: false,
    isError: false,
    pendingId: null,
    toggleFavourite: vi.fn(),
    refetch: vi.fn(),
  });
});

describe('<FavouritesView>', () => {
  it('shows the empty state when there are no favourites', () => {
    renderView();
    expect(screen.getByText('No favourites yet')).toBeInTheDocument();
  });

  it('shows an error state whose Retry calls refetch', async () => {
    const user = userEvent.setup();
    favState.isError = true;
    renderView();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(favState.refetch).toHaveBeenCalled();
  });

  it('renders each favourite with a select checkbox, an Add to cart, and Remove', () => {
    favState.favourites = [makeProduct()];
    favState.count = 1;
    renderView();

    expect(screen.getByText('Satin Nightgown')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Satin Nightgown' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('per-item "Add to cart" adds the product\'s first in-stock variant', async () => {
    const user = userEvent.setup();
    favState.favourites = [
      makeProduct({
        variants: [
          { id: 'v-oos', productID: 'p1', sku: 'a', size: 'S', color: 'Rose', stockQuantity: 0 },
          { id: 'v-ok', productID: 'p1', sku: 'b', size: 'M', color: 'Rose', stockQuantity: 3 },
        ],
      }),
    ];
    favState.count = 1;
    renderView();

    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(mockCart.addCartItem).toHaveBeenCalledWith('v-ok', 1);
    expect(await screen.findByRole('button', { name: 'Added ✓' })).toBeInTheDocument();
  });

  it('an out-of-stock favourite is shown but not selectable or addable', () => {
    favState.favourites = [
      makeProduct({ variants: [{ id: 'v0', productID: 'p1', sku: 'x', size: 'M', color: 'Rose', stockQuantity: 0 }] }),
    ];
    favState.count = 1;
    renderView();

    expect(screen.getByRole('checkbox', { name: 'Select Satin Nightgown' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
  });

  it('"Select all" ticks the in-stock favourites and bulk-adds them with a summary', async () => {
    const user = userEvent.setup();
    favState.favourites = [
      makeProduct({ id: 'p1', nameEn: 'A' }),
      makeProduct({ id: 'p2', nameEn: 'B' }),
      makeProduct({
        id: 'p3',
        nameEn: 'C',
        variants: [{ id: 'v3', productID: 'p3', sku: 'c', size: 'M', color: null, stockQuantity: 0 }],
      }),
    ];
    favState.count = 3;
    renderView();

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    const bulk = screen.getByRole('button', { name: 'Add 2 to cart' });
    await user.click(bulk);

    await waitFor(() => expect(mockCart.addCartItem).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('2 added to cart.')).toBeInTheDocument();
  });

  it('"Remove" delegates to the favourites hook', async () => {
    const user = userEvent.setup();
    favState.favourites = [makeProduct()];
    favState.count = 1;
    renderView();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(favState.toggleFavourite).toHaveBeenCalledWith('p1');
  });
});
