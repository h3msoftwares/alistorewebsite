import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { SearchOverlay } from './search-overlay';

vi.mock('next/image', () => ({
  default: ({ src, alt }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src as string} alt={alt as string} />
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
    catalogApi: { ...actual.catalogApi, listProducts: vi.fn() },
  };
});

import { catalogApi } from '@/lib/api';
const mock = vi.mocked(catalogApi, true);

const makeProduct = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  nameEn: 'Satin Nightgown',
  nameAr: 'قميص نوم ساتان',
  price: '32',
  compareAtPrice: null,
  onSale: false,
  effectivePrice: '32',
  images: [{ id: 'im1', url: 'http://img.test/satin.jpg', altEn: null, altAr: null, color: null, sortOrder: 0 }],
  variants: [],
  ...over,
});

const result = (items: unknown[], total = items.length) => ({ items, total, page: 1, pageSize: 8 });

const renderOverlay = (props: Partial<{ open: boolean; onClose: () => void; locale: string }> = {}) => {
  const { Wrapper } = createWrapper();
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <SearchOverlay open={props.open ?? true} onClose={onClose} locale={props.locale ?? 'en'} />,
    { wrapper: Wrapper },
  );
  return { ...utils, onClose };
};

beforeEach(() => vi.clearAllMocks());

describe('<SearchOverlay>', () => {
  it('does not query until at least 2 characters are typed', async () => {
    const user = userEvent.setup();
    renderOverlay();

    expect(screen.getByText(/Type at least 2 characters/i)).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'a');
    // let the debounce elapse — a single character must still not query
    await act(() => new Promise((r) => setTimeout(r, 350)));
    expect(mock.listProducts).not.toHaveBeenCalled();
  });

  it('debounces the input, then queries GET /api/products?search= and lists the hits', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(result([makeProduct()]) as never);
    renderOverlay();

    await user.type(screen.getByRole('searchbox'), 'satin');

    await waitFor(() =>
      expect(mock.listProducts).toHaveBeenLastCalledWith({ search: 'satin', pageSize: 8 }),
    );
    const link = await screen.findByRole('link', { name: /Satin Nightgown/ });
    expect(link).toHaveAttribute('href', '/en/product/p1');
  });

  it('picking a result closes the overlay', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(result([makeProduct()]) as never);
    const { onClose } = renderOverlay();

    await user.type(screen.getByRole('searchbox'), 'satin');
    const link = await screen.findByRole('link', { name: /Satin Nightgown/ });
    await user.click(link);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a no-results message when the search comes back empty', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(result([]) as never);
    renderOverlay();

    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(await screen.findByText(/No products match/i)).toBeInTheDocument();
  });

  it('notes when there are more matches than the shown page', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(result([makeProduct(), makeProduct({ id: 'p2', nameEn: 'Satin Robe' })], 25) as never);
    renderOverlay();

    await user.type(screen.getByRole('searchbox'), 'satin');
    expect(await screen.findByText(/Showing the first 2 of 25 matches/i)).toBeInTheDocument();
  });

  it('surfaces an error state if the search request fails', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockRejectedValue(new Error('network'));
    renderOverlay();

    await user.type(screen.getByRole('searchbox'), 'satin');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't run that search/i);
  });
});
