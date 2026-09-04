import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { authenticated } from '@/store/slices/authSlice';
import { ApiError } from '@/lib/api/errors';
import { ProductDetail } from './product-detail';
import type { Product } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  catalogApi: { getProduct: vi.fn() },
  cartApi: { getCart: vi.fn(), addCartItem: vi.fn() },
}));

import { catalogApi, cartApi } from '@/lib/api';
const mockCatalog = vi.mocked(catalogApi, true);
const mockCart = vi.mocked(cartApi, true);

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
};

beforeEach(() => {
  vi.clearAllMocks();
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
