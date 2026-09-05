import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeGuestStore } from '@/test/utils';
import { FavouritesDrawer } from './favourites-drawer';

vi.mock('next/image', () => ({
  default: ({ src, alt }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src as string} alt={alt as string} />
  ),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, onClick }: { href: unknown; children: React.ReactNode; onClick?: () => void }) => (
    <a href={typeof href === 'string' ? href : '#'} onClick={onClick}>
      {children}
    </a>
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

const renderDrawer = (props: Partial<{ open: boolean; onClose: () => void; locale: string }> = {}) => {
  const { Wrapper, store } = createWrapper(makeGuestStore());
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <FavouritesDrawer open={props.open ?? true} onClose={onClose} locale={props.locale ?? 'en'} />,
    { wrapper: Wrapper },
  );
  return { ...utils, store, onClose };
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

describe('<FavouritesDrawer>', () => {
  it('reflects the open/closed prop via the shared Drawer aria-hidden', () => {
    const { container, rerender } = renderDrawer({ open: false });
    expect(container.querySelector('.drawer')).toHaveAttribute('aria-hidden', 'true');
    rerender(<FavouritesDrawer open onClose={vi.fn()} locale="en" />);
    expect(container.querySelector('.drawer')).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('close button calls onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Close favourites' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no favourites', () => {
    renderDrawer();
    expect(screen.getByText('No favourites yet')).toBeInTheDocument();
  });

  it('shows an error state whose Retry calls refetch', async () => {
    const user = userEvent.setup();
    favState.isError = true;
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(favState.refetch).toHaveBeenCalled();
  });

  it('renders a favourite row: thumbnail, linked name, price, add + remove', () => {
    favState.favourites = [makeProduct()];
    favState.count = 1;
    renderDrawer();

    expect(screen.getByRole('img')).toHaveAttribute('src', 'http://img.test/n.jpg');
    expect(screen.getByRole('link', { name: 'Satin Nightgown' })).toHaveAttribute('href', '/en/product/p1');
    expect(screen.getByText('$32.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('per-row "Add to cart" adds the first in-stock variant', async () => {
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
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(mockCart.addCartItem).toHaveBeenCalledWith('v-ok', 1);
    expect(await screen.findByRole('button', { name: 'Added ✓' })).toBeInTheDocument();
  });

  it('a product with no variant in stock is shown but not addable or selectable', () => {
    favState.favourites = [
      makeProduct({ variants: [{ id: 'v0', productID: 'p1', sku: 'x', size: 'M', color: 'Rose', stockQuantity: 0 }] }),
    ];
    favState.count = 1;
    renderDrawer();

    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Select Satin Nightgown' })).toBeDisabled();
  });

  it('select a row + "Add to cart" bulk button adds it and reports a summary', async () => {
    const user = userEvent.setup();
    favState.favourites = [makeProduct()];
    favState.count = 1;
    renderDrawer();

    await user.click(screen.getByRole('checkbox', { name: 'Select Satin Nightgown' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 to cart' }));

    await waitFor(() => expect(mockCart.addCartItem).toHaveBeenCalledWith('v1', 1));
    expect(await screen.findByText('1 added to cart.')).toBeInTheDocument();
  });

  it('"Select all" ticks every in-stock row and the bulk button counts them', async () => {
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
    renderDrawer();

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Add 2 to cart' })).toBeInTheDocument();
  });

  it('"Remove" delegates to the favourites hook', async () => {
    const user = userEvent.setup();
    favState.favourites = [makeProduct()];
    favState.count = 1;
    renderDrawer();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(favState.toggleFavourite).toHaveBeenCalledWith('p1');
  });

  it('"View all favourites" links to the page and closes the drawer', async () => {
    const user = userEvent.setup();
    favState.favourites = [makeProduct()];
    favState.count = 1;
    const { onClose } = renderDrawer({ locale: 'ar' });

    const link = screen.getByRole('link', { name: 'عرض كل المفضّلة' });
    expect(link).toHaveAttribute('href', '/ar/favourites');
    await user.click(link);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
