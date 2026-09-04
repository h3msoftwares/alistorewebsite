import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { CartView } from './cart-view';

// next/image + next/link need the Next runtime/router; stub them to plain tags
// so this stays a pure component test (same spirit as the hook tests mocking
// @/lib/api).
vi.mock('next/image', () => ({
  // Only forward the props this page actually passes to next/image.
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
const mock = vi.mocked(cartApi, true);

type Over = Record<string, unknown>;

const makeItem = (over: Over = {}, productOver: Over = {}, variantOver: Over = {}) => ({
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
    ...variantOver,
  },
  ...over,
});

const cart = (items: unknown[], subtotal: number) => ({ items, subtotal });

const renderCart = (locale: 'en' | 'ar' = 'en') => {
  const { Wrapper } = createWrapper();
  return render(<CartView locale={locale} />, { wrapper: Wrapper });
};

beforeEach(() => vi.clearAllMocks());

describe('<CartView>', () => {
  it('renders a line item from cart data: image, name, variant, unit price, line total', async () => {
    mock.getCart.mockResolvedValue(cart([makeItem()], 999) as never);
    renderCart();

    const nameEl = await screen.findByText('Everyday Cotton T-Shirt');
    const row = nameEl.closest('tr') as HTMLElement;

    const img = within(row).getByRole('img');
    expect(img).toHaveAttribute('src', 'http://img.test/tee.jpg');
    expect(img).toHaveAttribute('alt', 'A cotton tee');

    expect(within(row).getByText('2-3Y · Yellow')).toBeInTheDocument();
    expect(within(row).getByText('$12.00')).toBeInTheDocument(); // unit price (PriceTag)
    expect(within(row).getByText('$24.00')).toBeInTheDocument(); // line total = 2 × 12
  });

  it('increasing quantity calls the update mutation with (itemId, newQty)', async () => {
    const user = userEvent.setup();
    mock.getCart.mockResolvedValue(cart([makeItem({ quantity: 2 })], 24) as never);
    mock.updateCartItem.mockResolvedValue({ id: 'item-1', quantity: 3 } as never);
    renderCart();

    await screen.findByText('Everyday Cotton T-Shirt');
    await user.click(
      screen.getByRole('button', { name: 'Increase Quantity for Everyday Cotton T-Shirt' })
    );

    expect(mock.updateCartItem).toHaveBeenCalledWith('item-1', 3);
  });

  it('decreasing quantity calls the update mutation with the decremented qty', async () => {
    const user = userEvent.setup();
    mock.getCart.mockResolvedValue(cart([makeItem({ quantity: 2 })], 24) as never);
    mock.updateCartItem.mockResolvedValue({ id: 'item-1', quantity: 1 } as never);
    renderCart();

    await screen.findByText('Everyday Cotton T-Shirt');
    await user.click(
      screen.getByRole('button', { name: 'Decrease Quantity for Everyday Cotton T-Shirt' })
    );

    expect(mock.updateCartItem).toHaveBeenCalledWith('item-1', 1);
  });

  it('the quantity stepper respects the variant stock as its max', async () => {
    mock.getCart.mockResolvedValue(
      cart([makeItem({ quantity: 3 }, {}, { stockQuantity: 3 })], 36) as never
    );
    renderCart();

    await screen.findByText('Everyday Cotton T-Shirt');
    expect(
      screen.getByRole('button', { name: 'Increase Quantity for Everyday Cotton T-Shirt' })
    ).toBeDisabled();
  });

  it('removing an item calls the remove mutation and the row disappears', async () => {
    const user = userEvent.setup();
    const itemA = makeItem({ id: 'item-a' });
    const itemB = makeItem({ id: 'item-b' }, { id: 'p2', nameEn: 'Wool Scarf' }, { id: 'v2' });
    mock.getCart
      .mockResolvedValueOnce(cart([itemA, itemB], 48) as never)
      .mockResolvedValue(cart([itemA], 24) as never);
    mock.removeCartItem.mockResolvedValue(undefined as never);
    renderCart();

    const scarfRow = (await screen.findByText('Wool Scarf')).closest('tr') as HTMLElement;
    await user.click(within(scarfRow).getByRole('button', { name: 'Remove' }));

    expect(mock.removeCartItem).toHaveBeenCalledWith('item-b');
    await waitFor(() => expect(screen.queryByText('Wool Scarf')).not.toBeInTheDocument());
    expect(screen.getByText('Everyday Cotton T-Shirt')).toBeInTheDocument();
  });

  it('disables a row’s controls while its mutation is in flight', async () => {
    const user = userEvent.setup();
    mock.getCart.mockResolvedValue(cart([makeItem({ quantity: 2 })], 24) as never);
    let release!: (v: unknown) => void;
    mock.updateCartItem.mockReturnValue(new Promise((r) => (release = r)) as never);
    renderCart();

    await screen.findByText('Everyday Cotton T-Shirt');
    const inc = screen.getByRole('button', { name: 'Increase Quantity for Everyday Cotton T-Shirt' });
    const dec = screen.getByRole('button', { name: 'Decrease Quantity for Everyday Cotton T-Shirt' });
    const removeBtn = screen.getByRole('button', { name: 'Remove' });

    await user.click(inc);

    await waitFor(() => expect(removeBtn).toBeDisabled());
    expect(inc).toBeDisabled();
    expect(dec).toBeDisabled();

    release({ id: 'item-1', quantity: 3 });
    await waitFor(() => expect(removeBtn).not.toBeDisabled());
  });

  it('shows the empty state when the cart has no items', async () => {
    mock.getCart.mockResolvedValue(cart([], 0) as never);
    renderCart();

    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue shopping' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error state with a retry when the cart fails to load', async () => {
    mock.getCart.mockRejectedValue(new Error('network'));
    renderCart();

    expect(await screen.findByText("Couldn't load your cart")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows a loading placeholder (heading, no table) while the cart is pending', () => {
    mock.getCart.mockReturnValue(new Promise(() => {}) as never); // never resolves
    const { container } = renderCart();

    expect(screen.getByRole('heading', { name: 'Cart' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(container.querySelector('.skeleton')).toBeTruthy();
  });

  it('renders the subtotal from the API response, not a client-side recomputation', async () => {
    // 1 line of 2 × $12 = $24, but the API says the subtotal is $500.
    mock.getCart.mockResolvedValue(cart([makeItem({ quantity: 2 })], 500) as never);
    renderCart();

    await screen.findByText('Everyday Cotton T-Shirt');
    const subtotalRow = screen.getByText('Subtotal').closest('div') as HTMLElement;
    expect(within(subtotalRow).getByText('$500.00')).toBeInTheDocument();
    expect(screen.queryByText('$524.00')).not.toBeInTheDocument();
  });
});
