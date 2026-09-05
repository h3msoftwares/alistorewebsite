import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { RelatedProducts } from './related-products';
import type { Product } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  catalogApi: { getProduct: vi.fn(), listCategoryProducts: vi.fn() },
  cartApi: { addCartItem: vi.fn() },
  favouritesApi: { listFavourites: vi.fn(), addFavourite: vi.fn(), removeFavourite: vi.fn() },
  isApiError: () => false,
}));

import { catalogApi } from '@/lib/api';
const mockCatalog = vi.mocked(catalogApi, true);

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    sku: `SKU-${id}`,
    nameEn: `Product ${id}`,
    nameAr: `منتج ${id}`,
    categoryID: 'cat1',
    price: '20.00',
    quantity: 10,
    effectivePrice: 20,
    onSale: false,
    isActive: true,
    dateCreated: '2026-01-01T00:00:00.000Z',
    images: [],
    variants: [{ id: `v-${id}`, productID: id, sku: `v-${id}`, size: null, color: null, stockQuantity: 5 }],
    ...overrides,
  };
}

const outOfStockVariant = (id: string) => [
  { id: `v-${id}`, productID: id, sku: `v-${id}`, size: null, color: null, stockQuantity: 0 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RelatedProducts', () => {
  it('shows a loading skeleton while fetching', () => {
    mockCatalog.listCategoryProducts.mockReturnValue(new Promise(() => {})); // never resolves
    const { Wrapper } = createWrapper();
    render(<RelatedProducts categoryId="cat1" excludeProductId="p1" locale="en" />, { wrapper: Wrapper });

    expect(screen.getByText('You might also like')).toBeInTheDocument();
    expect(document.querySelector('.pdp__related[aria-busy="true"]')).toBeInTheDocument();
  });

  it('excludes the current product and caps at 4, prioritizing in-stock candidates', async () => {
    mockCatalog.listCategoryProducts.mockResolvedValue({
      items: [
        makeProduct('p1'), // the current product — must be excluded even though the API returned it
        makeProduct('p2', { variants: outOfStockVariant('p2') }),
        makeProduct('p3'), // in stock
        makeProduct('p4', { variants: outOfStockVariant('p4') }),
        makeProduct('p5'), // in stock
        makeProduct('p6'), // in stock
        makeProduct('p7'), // in stock
      ],
      total: 7,
      page: 1,
      pageSize: 12,
    });
    const { Wrapper } = createWrapper();
    render(<RelatedProducts categoryId="cat1" excludeProductId="p1" locale="en" />, { wrapper: Wrapper });

    // Wait on resolved content, not the heading — the loading skeleton
    // renders the same heading, so waiting on it alone would resolve during
    // the pending state instead of after the data actually settles.
    await waitFor(() => expect(screen.getByText('Product p3')).toBeInTheDocument());

    // Exactly 4 in-stock candidates (p3, p5, p6, p7) — the two out-of-stock
    // ones (p2, p4) don't make the cut since 4 in-stock ones already fill it.
    expect(screen.getByText('Product p5')).toBeInTheDocument();
    expect(screen.getByText('Product p6')).toBeInTheDocument();
    expect(screen.getByText('Product p7')).toBeInTheDocument();
    expect(screen.queryByText('Product p1')).not.toBeInTheDocument();
    expect(screen.queryByText('Product p2')).not.toBeInTheDocument();
    expect(screen.queryByText('Product p4')).not.toBeInTheDocument();
  });

  it('renders fewer than 4 cards — not padded or broken — when the category has fewer than 4 other products', async () => {
    mockCatalog.listCategoryProducts.mockResolvedValue({
      items: [makeProduct('p1'), makeProduct('p2'), makeProduct('p3')],
      total: 3,
      page: 1,
      pageSize: 12,
    });
    const { Wrapper } = createWrapper();
    render(<RelatedProducts categoryId="cat1" excludeProductId="p1" locale="en" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Product p2')).toBeInTheDocument());

    const grid = document.querySelector('.product-grid');
    expect(grid?.children).toHaveLength(2); // p2, p3 — p1 excluded, no padding to reach 4
    expect(screen.getByText('Product p2')).toBeInTheDocument();
    expect(screen.getByText('Product p3')).toBeInTheDocument();
  });

  it('renders nothing when the category has no other products', async () => {
    mockCatalog.listCategoryProducts.mockResolvedValue({
      items: [makeProduct('p1')], // only the current product itself
      total: 1,
      page: 1,
      pageSize: 12,
    });
    const { Wrapper } = createWrapper();
    const { container } = render(<RelatedProducts categoryId="cat1" excludeProductId="p1" locale="en" />, {
      wrapper: Wrapper,
    });

    // Wait for the loading skeleton to clear, not just for the fetch to have
    // been called — it starts non-empty (the skeleton).
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText('You might also like')).not.toBeInTheDocument();
  });

  it('renders nothing on a fetch error, rather than an error state', async () => {
    mockCatalog.listCategoryProducts.mockRejectedValue(new Error('network error'));
    const { Wrapper } = createWrapper();
    const { container } = render(<RelatedProducts categoryId="cat1" excludeProductId="p1" locale="en" />, {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(mockCatalog.listCategoryProducts).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
