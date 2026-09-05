import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { SearchOverlay } from './search-overlay';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
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

const RECENT_KEY = 'alistore:recent-searches';

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

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('<SearchOverlay> — search', () => {
  it('does not query until at least 2 characters are typed', async () => {
    const user = userEvent.setup();
    renderOverlay();

    expect(screen.getByText(/Type at least 2 characters/i)).toBeInTheDocument();
    await user.type(screen.getByRole('combobox'), 'a');
    await act(() => new Promise((r) => setTimeout(r, 350)));
    expect(mock.listProducts).not.toHaveBeenCalled();
  });

  it('debounces the input, then queries GET /api/products?search= and lists the hits', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(result([makeProduct()]) as never);
    renderOverlay();

    await user.type(screen.getByRole('combobox'), 'satin');
    await waitFor(() =>
      expect(mock.listProducts).toHaveBeenLastCalledWith({ search: 'satin', pageSize: 8 }),
    );
    const option = await screen.findByRole('option', { name: /Satin Nightgown/ });
    expect(option).toHaveAttribute('href', '/en/product/p1');
  });

  it('picking a result closes the overlay', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(result([makeProduct()]) as never);
    const { onClose } = renderOverlay();

    await user.type(screen.getByRole('combobox'), 'satin');
    await user.click(await screen.findByRole('option', { name: /Satin Nightgown/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a no-results message when the search comes back empty', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(result([]) as never);
    renderOverlay();

    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(await screen.findByText(/No products match/i)).toBeInTheDocument();
  });

  it('notes when there are more matches than the shown page', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(
      result([makeProduct(), makeProduct({ id: 'p2', nameEn: 'Satin Robe' })], 25) as never,
    );
    renderOverlay();

    await user.type(screen.getByRole('combobox'), 'satin');
    expect(await screen.findByText(/Showing the first 2 of 25 matches/i)).toBeInTheDocument();
  });

  it('surfaces an error state if the search request fails', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockRejectedValue(new Error('network'));
    renderOverlay();

    await user.type(screen.getByRole('combobox'), 'satin');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't run that search/i);
  });

  it('drops the previous hits when a follow-up query matches nothing', async () => {
    const user = userEvent.setup();
    mock.listProducts
      .mockResolvedValueOnce(
        result([
          makeProduct({ id: 'a', nameEn: 'Dino Print Pajama Set' }),
          makeProduct({ id: 'b', nameEn: 'Lace Trim Bralette Set' }),
        ]) as never,
      )
      .mockResolvedValue(result([]) as never);
    renderOverlay();
    const box = screen.getByRole('combobox');

    await user.type(box, 'set');
    expect(await screen.findByRole('option', { name: /Dino Print Pajama Set/ })).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'xx');

    expect(await screen.findByText(/No products match .xx./i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Dino Print Pajama Set/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Lace Trim Bralette Set/ })).not.toBeInTheDocument();
  });

  it('does not show the old hits while a new query is still resolving', async () => {
    const user = userEvent.setup();
    let resolveSecond!: (v: unknown) => void;
    mock.listProducts
      .mockResolvedValueOnce(result([makeProduct({ id: 'a', nameEn: 'Wool Coat' })]) as never)
      .mockImplementationOnce(
        () => new Promise((res) => { resolveSecond = res; }) as never,
      );
    renderOverlay();
    const box = screen.getByRole('combobox');

    await user.type(box, 'wool');
    await screen.findByRole('option', { name: /Wool Coat/ });

    await user.clear(box);
    await user.type(box, 'dino');

    // once the debounce fires, the 2nd query goes out and stays pending
    await waitFor(() => expect(mock.listProducts).toHaveBeenCalledTimes(2));
    // the old hit is gone and "Searching…" is shown — no stale results
    expect(screen.queryByRole('option', { name: /Wool Coat/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Searching/i)).toBeInTheDocument();

    resolveSecond(result([makeProduct({ id: 'b', nameEn: 'Dino Print Pajama Set' })]));
    expect(await screen.findByRole('option', { name: /Dino Print Pajama Set/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Wool Coat/ })).not.toBeInTheDocument();
  });
});

describe('<SearchOverlay> — recent-search suggestions', () => {
  it('offers recent searches while the box is empty, and clicking one runs it', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['satin dress', 'wool coat']));
    mock.listProducts.mockResolvedValue(result([makeProduct()]) as never);
    renderOverlay();

    expect(await screen.findByText('Recent searches')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'satin dress' }));

    expect(screen.getByRole('combobox')).toHaveValue('satin dress');
    await waitFor(() =>
      expect(mock.listProducts).toHaveBeenLastCalledWith({ search: 'satin dress', pageSize: 8 }),
    );
  });

  it('remembers a search once a result is opened', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(result([makeProduct()]) as never);
    renderOverlay();

    await user.type(screen.getByRole('combobox'), 'satin');
    await user.click(await screen.findByRole('option', { name: /Satin Nightgown/ }));

    expect(JSON.parse(window.localStorage.getItem(RECENT_KEY)!)).toEqual(['satin']);
  });

  it('"Clear" wipes the recent list', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['satin dress']));
    renderOverlay();

    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(RECENT_KEY)).toBeNull();
  });
});

describe('<SearchOverlay> — keyboard navigation', () => {
  const twoResults = () =>
    result([makeProduct({ id: 'p1', nameEn: 'Satin Nightgown' }), makeProduct({ id: 'p2', nameEn: 'Satin Robe' })]);

  it('↓/↑ move a highlight over the results (focus stays in the box)', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(twoResults() as never);
    renderOverlay();

    const box = screen.getByRole('combobox');
    await user.type(box, 'satin');
    await screen.findByRole('option', { name: /Satin Nightgown/ });

    await user.keyboard('{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', 'search-option-0');
    expect(screen.getByRole('option', { name: /Satin Nightgown/ })).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(box).toHaveAttribute('aria-activedescendant', 'search-option-1');

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(box).not.toHaveAttribute('aria-activedescendant');
  });

  it('Enter on a highlighted result opens it and closes the overlay', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(twoResults() as never);
    const { onClose } = renderOverlay();

    await user.type(screen.getByRole('combobox'), 'satin');
    await screen.findByRole('option', { name: /Satin Nightgown/ });
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}'); // highlight the 2nd, open it

    expect(push).toHaveBeenCalledWith('/en/product/p2');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem('alistore:recent-searches')!)).toEqual(['satin']);
  });

  it('Enter with nothing highlighted opens the top hit', async () => {
    const user = userEvent.setup();
    mock.listProducts.mockResolvedValue(twoResults() as never);
    renderOverlay();

    await user.type(screen.getByRole('combobox'), 'satin');
    await screen.findByRole('option', { name: /Satin Nightgown/ });
    await user.keyboard('{Enter}');

    expect(push).toHaveBeenCalledWith('/en/product/p1');
  });

  it('Enter on a highlighted recent search re-runs it', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(['satin dress', 'wool coat']));
    mock.listProducts.mockResolvedValue(result([makeProduct()]) as never);
    renderOverlay();

    const box = await screen.findByRole('combobox');
    await screen.findByText('Recent searches');
    await user.click(box);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}'); // 2nd recent entry

    expect(box).toHaveValue('wool coat');
    await waitFor(() =>
      expect(mock.listProducts).toHaveBeenLastCalledWith({ search: 'wool coat', pageSize: 8 }),
    );
  });
});
