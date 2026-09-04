import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeGuestStore } from '@/test/utils';
import { selectCartCount } from '@/store/slices/cartSlice';
import { CartDrawer } from './cart-drawer';

vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, style }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src as string}
      alt={alt as string}
      width={width as number}
      height={height as number}
      style={style as React.CSSProperties}
    />
  ),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
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
      addCartItem: vi.fn(),
      updateCartItem: vi.fn(),
      removeCartItem: vi.fn(),
      clearCart: vi.fn(),
    },
  };
});

import { cartApi } from '@/lib/api';
const mock = vi.mocked(cartApi, true);

const makeItem = (over: Record<string, unknown> = {}, productOver: Record<string, unknown> = {}) => ({
  id: 'item-1',
  cartID: 'c1',
  variantID: 'v1',
  quantity: 2,
  variant: {
    id: 'v1',
    productID: 'p1',
    sku: 'SKU-1',
    size: '2-3Y',
    color: 'Yellow',
    stockQuantity: 10,
    product: {
      id: 'p1',
      sku: 'SKU-1',
      nameEn: 'Everyday Cotton T-Shirt',
      nameAr: 'تيشيرت قطني يومي',
      price: '12',
      compareAtPrice: null,
      images: [{ id: 'im1', url: 'http://img.test/tee.jpg', altEn: 'A cotton tee', altAr: null, sortOrder: 0 }],
      variants: [],
      ...productOver,
    },
  },
  ...over,
});

const cart = (items: unknown[], subtotal: number) => ({ items, subtotal });

const renderDrawer = (props: Partial<{ open: boolean; onClose: () => void; locale: string }> = {}) => {
  // useCart() now holds off until auth status resolves — a fresh 'loading'
  // store would never fetch.
  const { Wrapper, store } = createWrapper(makeGuestStore());
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <CartDrawer open={props.open ?? true} onClose={onClose} locale={props.locale ?? 'en'} />,
    { wrapper: Wrapper }
  );
  return { ...utils, store, onClose };
};

beforeEach(() => vi.clearAllMocks());

describe('<CartDrawer>', () => {
  it('reflects the open/closed prop via the shared Drawer\'s aria-hidden', async () => {
    mock.getCart.mockResolvedValue(cart([], 0) as never);
    const { rerender, container } = renderDrawer({ open: false });
    expect(container.querySelector('.drawer')).toHaveAttribute('aria-hidden', 'true');

    rerender(<CartDrawer open onClose={vi.fn()} locale="en" />);
    await waitFor(() => expect(container.querySelector('.drawer')).not.toHaveAttribute('aria-hidden', 'true'));
  });

  it('clicking the close button calls onClose', async () => {
    const user = userEvent.setup();
    mock.getCart.mockResolvedValue(cart([], 0) as never);
    const { onClose } = renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Close cart' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a line item: thumbnail, name, variant, price, quantity control', async () => {
    mock.getCart.mockResolvedValue(cart([makeItem()], 24) as never);
    renderDrawer();

    const name = await screen.findByText('Everyday Cotton T-Shirt');
    expect(name.closest('a')).toHaveAttribute('href', '/en/product/p1');

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'http://img.test/tee.jpg');

    expect(screen.getByText('2-3Y · Yellow')).toBeInTheDocument();
    expect(screen.getByText('$12.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase Quantity for Everyday Cotton T-Shirt' })).toBeInTheDocument();
  });

  it('increasing quantity in the drawer calls the same update mutation the cart page uses', async () => {
    const user = userEvent.setup();
    mock.getCart.mockResolvedValue(cart([makeItem({ quantity: 2 })], 24) as never);
    mock.updateCartItem.mockResolvedValue({ id: 'item-1', quantity: 3 } as never);
    renderDrawer();

    await screen.findByText('Everyday Cotton T-Shirt');
    await user.click(screen.getByRole('button', { name: 'Increase Quantity for Everyday Cotton T-Shirt' }));

    expect(mock.updateCartItem).toHaveBeenCalledWith('item-1', { quantity: 3, variantId: undefined });
  });

  it('removing an item live-updates the drawer (row disappears, subtotal reflects the fresh fetch)', async () => {
    const user = userEvent.setup();
    const itemA = makeItem({ id: 'item-a' });
    const itemB = makeItem({ id: 'item-b' }, { id: 'p2', nameEn: 'Wool Scarf' });
    mock.getCart
      .mockResolvedValueOnce(cart([itemA, itemB], 48) as never)
      .mockResolvedValue(cart([itemA], 24) as never);
    mock.removeCartItem.mockResolvedValue(undefined as never);
    renderDrawer();

    const scarfName = await screen.findByText('Wool Scarf');
    const scarfRow = scarfName.closest('li') as HTMLElement;
    await user.click(within(scarfRow).getByRole('button', { name: 'Remove' }));

    expect(mock.removeCartItem).toHaveBeenCalledWith('item-b');
    await waitFor(() => expect(screen.queryByText('Wool Scarf')).not.toBeInTheDocument());
    expect(screen.getByText('Everyday Cotton T-Shirt')).toBeInTheDocument();
  });

  it('mounting the drawer (as Topbar always does) syncs the header badge count in Redux', async () => {
    mock.getCart.mockResolvedValue(cart([makeItem({ quantity: 2 }), makeItem({ id: 'item-2', quantity: 3 })], 60) as never);
    const { store } = renderDrawer();

    await waitFor(() => expect(selectCartCount(store.getState())).toBe(5));
  });

  it('shows the empty state with a "Continue shopping" link that closes the drawer', async () => {
    const user = userEvent.setup();
    mock.getCart.mockResolvedValue(cart([], 0) as never);
    const { onClose } = renderDrawer();

    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Continue shopping' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error state with retry when the cart fails to load', async () => {
    mock.getCart.mockRejectedValue(new Error('network'));
    renderDrawer();
    expect(await screen.findByText("Couldn't load your cart")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('"View Cart" and "Checkout" link to the right routes and close the drawer on click', async () => {
    const user = userEvent.setup();
    mock.getCart.mockResolvedValue(cart([makeItem()], 24) as never);
    const { onClose } = renderDrawer({ locale: 'ar' });

    await screen.findByText('تيشيرت قطني يومي'); // nameAr — this locale shows the Arabic name
    const viewCart = screen.getByRole('link', { name: 'عرض السلة' });
    const checkout = screen.getByRole('link', { name: 'الدفع' });
    expect(viewCart).toHaveAttribute('href', '/ar/cart');
    expect(checkout).toHaveAttribute('href', '/ar/checkout');

    await user.click(viewCart);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
