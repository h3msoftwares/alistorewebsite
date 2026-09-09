import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShowcaseRow } from './showcase-row';
import type { HomeShowcase } from '@/lib/types';

const products: { data: unknown; isPending: boolean } = { data: undefined, isPending: false };
const useProducts = vi.fn((query?: unknown) => {
  void query;
  return products;
});
vi.mock('@/hooks/use-catalog', () => ({ useProducts: (query?: unknown) => useProducts(query) }));
vi.mock('@/hooks/use-reveal', () => ({ useReveal: () => [{ current: null }, '', {}] }));

const showcase = (over: Partial<HomeShowcase> = {}): HomeShowcase => ({
  type: 'BEST_SELLERS',
  isActive: true,
  sortOrder: 5,
  labelEn: null,
  labelAr: null,
  ...over,
});

const oneProduct = {
  id: 'p1',
  sku: 'S1',
  nameEn: 'Tee',
  nameAr: 'تي',
  categoryID: 'c1',
  price: '20.00',
  quantity: 5,
  effectivePrice: 20,
  onSale: false,
  isActive: true,
  dateCreated: 'now',
  images: [],
  variants: [],
};

beforeEach(() => {
  products.data = undefined;
  products.isPending = false;
  useProducts.mockClear();
});

describe('<ShowcaseRow>', () => {
  it('renders nothing when the query returns no products', () => {
    products.data = { items: [] };
    const { container } = render(<ShowcaseRow locale="en" showcase={showcase()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the built-in label and the best_selling query for BEST_SELLERS', () => {
    products.data = { items: [oneProduct] };
    render(<ShowcaseRow locale="en" showcase={showcase({ type: 'BEST_SELLERS' })} />);
    expect(screen.getByRole('heading', { name: 'Best sellers' })).toBeInTheDocument();
    expect(useProducts).toHaveBeenCalledWith(expect.objectContaining({ sort: 'best_selling' }));
  });

  it('honours a custom label and the Arabic default', () => {
    products.data = { items: [oneProduct] };
    render(<ShowcaseRow locale="en" showcase={showcase({ labelEn: 'Top picks' })} />);
    expect(screen.getByRole('heading', { name: 'Top picks' })).toBeInTheDocument();

    render(<ShowcaseRow locale="ar" showcase={showcase({ type: 'ON_SALE' })} />);
    expect(screen.getByRole('heading', { name: 'التخفيضات' })).toBeInTheDocument();
  });

  it('queries onSale for ON_SALE and newest for NEW_ARRIVALS', () => {
    products.data = { items: [oneProduct] };
    render(<ShowcaseRow locale="en" showcase={showcase({ type: 'ON_SALE' })} />);
    expect(useProducts).toHaveBeenCalledWith(expect.objectContaining({ onSale: true }));

    render(<ShowcaseRow locale="en" showcase={showcase({ type: 'NEW_ARRIVALS' })} />);
    expect(useProducts).toHaveBeenCalledWith(expect.objectContaining({ sort: 'newest' }));
  });
});
