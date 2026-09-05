import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { authenticated } from '@/store/slices/authSlice';
import { ApiError } from '@/lib/api/errors';
import { ProductDetail } from './product-detail';
import type { Product } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  catalogApi: { getProduct: vi.fn(), listCategoryProducts: vi.fn() },
  cartApi: { getCart: vi.fn(), addCartItem: vi.fn() },
  favouritesApi: { listFavourites: vi.fn(), addFavourite: vi.fn(), removeFavourite: vi.fn() },
  isApiError: () => false,
}));

import { catalogApi, cartApi, favouritesApi } from '@/lib/api';
const mockCatalog = vi.mocked(catalogApi, true);
const mockCart = vi.mocked(cartApi, true);
const mockFavourites = vi.mocked(favouritesApi, true);

const baseProduct: Product = {
  id: 'p1',
  sku: 'SKU1',
  nameEn: 'Classic Shirt',
  nameAr: 'قميص كلاسيكي',
  descriptionEn: 'A classic shirt.',
  descriptionAr: 'قميص كلاسيكي.',
  categoryID: 'cat1',
  collectionID: 'col1',
  price: '39.00',
  compareAtPrice: '49.00',
  isActive: true,
  dateCreated: '2026-01-01T00:00:00.000Z',
  quantity: 20,
  // No active saleType/saleValue discount for the base fixture — just the
  // plain "was" price via compareAtPrice. effectivePrice mirrors price when
  // there's no sale, same as the real backend's withPricing() does.
  saleType: null,
  saleValue: null,
  effectivePrice: 39,
  onSale: false,
  images: [
    { id: 'img1', productID: 'p1', url: 'https://example.com/1.jpg', altEn: 'Front', altAr: 'أمامي', sortOrder: 0 },
    { id: 'img2', productID: 'p1', url: 'https://example.com/2.jpg', altEn: 'Back', altAr: 'خلفي', sortOrder: 1 },
  ],
  variants: [
    { id: 'v1', productID: 'p1', sku: 'SKU1-1', size: 'M', color: null, stockQuantity: 5 },
    { id: 'v2', productID: 'p1', sku: 'SKU1-2', size: 'L', color: null, stockQuantity: 0 },
  ],
  collection: { id: 'col1', nameEn: 'Men', nameAr: 'رجالي', slug: 'men' },
  category: {
    id: 'cat1',
    nameEn: 'Shirts',
    nameAr: 'قمصان',
    slug: 'shirts',
    isActive: true,
    showOnHome: false,
    sortOrder: 0,
    images: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default for the one test that authenticates — an authenticated user
  // enables useFavourites()'s backend query, which needs a resolved value.
  mockFavourites.listFavourites.mockResolvedValue([]);
  // RelatedProducts (rendered by every ProductDetail test) fetches this —
  // default to "nothing else in the category" so it renders null and stays
  // out of the way of tests that aren't about it.
  mockCatalog.listCategoryProducts.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12 });
});

describe('ProductDetail', () => {
  it('shows a loading skeleton, then the product once it resolves', async () => {
    mockCatalog.getProduct.mockResolvedValue(baseProduct);
    const { Wrapper } = createWrapper();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    // Not rendered yet on the very first pass — still resolving.
    expect(screen.queryByText('Classic Shirt')).not.toBeInTheDocument();
    expect(document.querySelector('.pdp[aria-busy="true"]')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());
    expect(mockCatalog.getProduct).toHaveBeenCalledWith('p1');
  });

  it('shows the not-found state on a 404 and never the generic error state', async () => {
    mockCatalog.getProduct.mockRejectedValue(new ApiError(404, { code: 'NOT_FOUND', message: 'Product not found' }));
    const { Wrapper } = createWrapper();
    render(<ProductDetail id="missing" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Product not found')).toBeInTheDocument());
    expect(screen.queryByText("Couldn't load this product")).not.toBeInTheDocument();
  });

  it('shows a retryable error state for a non-404 failure', async () => {
    mockCatalog.getProduct.mockRejectedValue(new ApiError(500, { code: 'INTERNAL', message: 'boom' }));
    const { Wrapper } = createWrapper();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText("Couldn't load this product")).toBeInTheDocument());
  });

  it('resolves the variant on selection, adds to cart, and disables the out-of-stock size', async () => {
    mockCatalog.getProduct.mockResolvedValue(baseProduct);
    mockCart.addCartItem.mockResolvedValue({ id: 'ci1' } as never);
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    const addToCartBtn = screen.getByRole('button', { name: 'Add to cart' });
    expect(addToCartBtn).toBeDisabled(); // nothing selected yet

    const sizeL = screen.getByRole('button', { name: 'L' });
    expect(sizeL).toBeDisabled(); // stockQuantity 0

    const sizeM = screen.getByRole('button', { name: 'M' });
    expect(sizeM).not.toBeDisabled();
    await user.click(sizeM);

    expect(addToCartBtn).not.toBeDisabled();
    await user.click(addToCartBtn);

    await waitFor(() => expect(mockCart.addCartItem).toHaveBeenCalledWith('v1', 1));
  });

  it('toggles the favourite button (guest path — no backend call, just the local slice)', async () => {
    mockCatalog.getProduct.mockResolvedValue(baseProduct);
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    const favBtn = screen.getByRole('button', { name: 'Add to favourites' });
    expect(favBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(favBtn);

    const toggled = screen.getByRole('button', { name: 'Remove from favourites' });
    expect(toggled).toHaveAttribute('aria-pressed', 'true');
    // Guest session — favouriting stays client-side, never hits the backend.
    expect(mockFavourites.addFavourite).not.toHaveBeenCalled();
  });

  it('shows a Home / Collection / Category breadcrumb using the already-fetched category and collection', async () => {
    mockCatalog.getProduct.mockResolvedValue(baseProduct);
    const { Wrapper } = createWrapper();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('Home');
    expect(within(nav).getByRole('link', { name: 'Men' })).toHaveAttribute('href', '/en/men');
    // Category is the trailing "current" crumb — not a link.
    expect(within(nav).getByText('Shirts')).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Shirts' })).not.toBeInTheDocument();
  });

  it('links the collection eyebrow to the collection page', async () => {
    mockCatalog.getProduct.mockResolvedValue(baseProduct);
    const { Wrapper } = createWrapper();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    // Two "Men" links now exist (breadcrumb + eyebrow) — scope to the eyebrow.
    const eyebrow = document.querySelector('.eyebrow');
    expect(eyebrow?.tagName).toBe('A');
    expect(eyebrow).toHaveAttribute('href', '/en/men');
    expect(eyebrow).toHaveTextContent('Men');
  });

  it('shows a low-stock badge once a variant with <= 5 units is resolved', async () => {
    mockCatalog.getProduct.mockResolvedValue(baseProduct);
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    expect(screen.queryByText('Only 5 left')).not.toBeInTheDocument();

    // v1 (size M) has stockQuantity: 5 — at the threshold.
    await user.click(screen.getByRole('button', { name: 'M' }));
    expect(screen.getByText('Only 5 left')).toBeInTheDocument();
  });

  it('does not show a low-stock badge for a healthy stock level', async () => {
    mockCatalog.getProduct.mockResolvedValue({
      ...baseProduct,
      variants: [
        { id: 'v1', productID: 'p1', sku: 'SKU1-1', size: 'M', color: null, stockQuantity: 50 },
        { id: 'v2', productID: 'p1', sku: 'SKU1-2', size: 'L', color: null, stockQuantity: 0 },
      ],
    });
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'M' }));
    expect(screen.queryByText(/left$/)).not.toBeInTheDocument();

    // L is the only variant for that size and it's fully out of stock, so the
    // chip itself is disabled (covered by the earlier "disables the
    // out-of-stock size" test) — nothing to resolve there, so no badge either
    // way; not re-asserted here to avoid clicking a disabled control.
    expect(screen.getByRole('button', { name: 'L' })).toBeDisabled();
  });

  it('shows the sale price and Save badge from an active saleType/saleValue discount, even with no compareAtPrice', async () => {
    // Regression check: the PDP used to derive its sale badge from
    // compareAtPrice alone. A product discounted via saleType/saleValue
    // (effectivePrice/onSale, computed server-side) with no compareAtPrice
    // set must still show the sale price and "Save $X" badge.
    mockCatalog.getProduct.mockResolvedValue({
      ...baseProduct,
      compareAtPrice: null,
      saleType: 'PERCENT',
      saleValue: '25',
      effectivePrice: 29,
      onSale: true,
    });
    const { Wrapper } = createWrapper();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    expect(screen.getByText('$29.00')).toBeInTheDocument(); // sale price
    expect(screen.getByText('$39.00')).toBeInTheDocument(); // struck-through original
    expect(screen.getByText('Save $10.00')).toBeInTheDocument();
  });

  it('shows a variant price override instead of the product base price once selected', async () => {
    mockCatalog.getProduct.mockResolvedValue({
      ...baseProduct,
      compareAtPrice: null,
      variants: [
        {
          id: 'v1',
          productID: 'p1',
          sku: 'SKU1-1',
          size: 'M',
          color: null,
          price: '45.00',
          effectivePrice: 45,
          onSale: false,
          stockQuantity: 5,
        },
        { id: 'v2', productID: 'p1', sku: 'SKU1-2', size: 'L', color: null, stockQuantity: 0 },
      ],
    });
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    // No variant resolved yet — the product's own price.
    expect(screen.getByText('$39.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'M' }));

    // Resolved — the variant's own price override, not the product's.
    await waitFor(() => expect(screen.getByText('$45.00')).toBeInTheDocument());
    expect(screen.queryByText('$39.00')).not.toBeInTheDocument();
  });

  it("uses the resolved variant's own effectivePrice/onSale once selected, not the product-level sale", async () => {
    mockCatalog.getProduct.mockResolvedValue({
      ...baseProduct,
      price: '100.00',
      compareAtPrice: null,
      saleType: 'PERCENT',
      saleValue: '20',
      effectivePrice: 80,
      onSale: true,
      variants: [
        {
          id: 'v1',
          productID: 'p1',
          sku: 'SKU1-1',
          size: 'M',
          color: null,
          price: '50.00',
          effectivePrice: 40,
          onSale: true,
          stockQuantity: 5,
        },
        { id: 'v2', productID: 'p1', sku: 'SKU1-2', size: 'L', color: null, stockQuantity: 0 },
      ],
    });
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    // No variant resolved yet — the product-level sale (100 -> 80).
    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'M' }));

    // Resolved — the variant's own price/effectivePrice (50 -> 40), not the
    // product's (100 -> 80).
    await waitFor(() => expect(screen.getByText('$40.00')).toBeInTheDocument());
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.queryByText('$80.00')).not.toBeInTheDocument();
    expect(screen.queryByText('$100.00')).not.toBeInTheDocument();
  });

  it('swaps the gallery to colour-tagged photos when a colour swatch is selected', async () => {
    mockCatalog.getProduct.mockResolvedValue({
      ...baseProduct,
      images: [
        {
          id: 'img1',
          productID: 'p1',
          url: 'https://example.com/generic.jpg',
          altEn: 'Front (generic)',
          altAr: null,
          sortOrder: 0,
          color: null,
        },
        {
          id: 'img2',
          productID: 'p1',
          url: 'https://example.com/black.jpg',
          altEn: 'Black colourway',
          altAr: null,
          sortOrder: 1,
          color: 'Black',
        },
        {
          id: 'img3',
          productID: 'p1',
          url: 'https://example.com/beige.jpg',
          altEn: 'Beige colourway',
          altAr: null,
          sortOrder: 2,
          color: 'Beige',
        },
      ],
      variants: [
        { id: 'v1', productID: 'p1', sku: 'SKU1-1', size: null, color: 'Black', stockQuantity: 5 },
        { id: 'v2', productID: 'p1', sku: 'SKU1-2', size: null, color: 'Beige', stockQuantity: 5 },
      ],
    });
    const { Wrapper } = createWrapper();
    const user = userEvent.setup();
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Classic Shirt')).toBeInTheDocument());

    // No colour chosen yet — the generic (untagged) shot leads the gallery.
    expect(screen.getByRole('img', { name: 'Front (generic)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Colour: Black' }));

    // Filters down to Black's tagged photo; the generic shot drops out.
    await waitFor(() => expect(screen.getByRole('img', { name: 'Black colourway' })).toBeInTheDocument());
    expect(screen.queryByRole('img', { name: 'Front (generic)' })).not.toBeInTheDocument();
  });

  it('shows a "hidden from customers" notice only to an admin viewing an inactive product', async () => {
    mockCatalog.getProduct.mockResolvedValue({ ...baseProduct, isActive: false });
    const { Wrapper, store } = createWrapper();
    store.dispatch(
      authenticated({ id: 'u1', name: 'Admin', email: 'admin@alistore.com', role: 'ADMIN' })
    );
    render(<ProductDetail id="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Hidden from customers')).toBeInTheDocument());
  });
});
