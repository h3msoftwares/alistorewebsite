import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import type { Collection, CollectionRule } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', id: 'c1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

function makeProduct(i: number) {
  return { id: `p${i}`, nameEn: `Product ${i}`, nameAr: `منتج ${i}`, sku: `SKU-${i}` };
}

const manualCollection: Collection = {
  id: 'c1',
  nameEn: 'Sale',
  nameAr: 'تخفيضات',
  slug: 'sale',
  descriptionEn: '',
  descriptionAr: '',
  isActive: true,
  type: 'MANUAL',
  showInNav: false,
  showOnHome: false,
  showOnHomeAsImage: false,
  sortOrder: 0,
  homeSortOrder: 0,
  archivedAt: null,
  images: [],
  rules: [],
};

const hybridCollection: Collection = {
  ...manualCollection,
  type: 'HYBRID',
  rules: [{ id: 'r1', groupNumber: 0, field: 'PRICE', operator: 'GREATER_THAN_OR_EQUAL', value: 20 } as CollectionRule],
};

const collectionQuery: { data: Collection; isPending: boolean; isError: boolean } = {
  data: manualCollection,
  isPending: false,
  isError: false,
};
const linkedProductsQuery: { data: ReturnType<typeof makeProduct>[]; isPending: boolean } = {
  data: [],
  isPending: false,
};
const searchProductsQuery: { data: { items: ReturnType<typeof makeProduct>[] } | undefined } = { data: undefined };
const categoriesQuery = { data: [] };
const previewQuery = { mutate: vi.fn(), isPending: false, isError: false, data: undefined, reset: vi.fn() };

const updateCollection = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const setProducts = { mutate: vi.fn(), isPending: false };
const setRules = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const archiveCollection = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const restoreCollection = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const permanentDeleteCollection = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const addImage = { mutate: vi.fn(), isPending: false };
const deleteImage = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/use-catalog', () => ({
  useCollection: () => collectionQuery,
  useCollectionProducts: () => linkedProductsQuery,
  useSetCollectionProducts: () => setProducts,
  useProducts: () => searchProductsQuery,
  useAdminCategories: () => categoriesQuery,
  useSetCollectionRules: () => setRules,
  usePreviewCollectionRules: () => previewQuery,
  useUpdateCollection: () => updateCollection,
  useDeleteCollection: () => archiveCollection,
  useRestoreCollection: () => restoreCollection,
  usePermanentDeleteCollection: () => permanentDeleteCollection,
  useAddCollectionImage: () => addImage,
  useDeleteCollectionImage: () => deleteImage,
}));

import EditCollectionPage from './page';

function renderPage() {
  const { Wrapper } = createWrapper();
  return render(<EditCollectionPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(collectionQuery, { data: manualCollection, isPending: false, isError: false });
  Object.assign(linkedProductsQuery, { data: [], isPending: false });
  Object.assign(searchProductsQuery, { data: undefined });
});

describe('EditCollectionPage — products panel', () => {
  it('lists linked products in a table, not an unbounded list', async () => {
    Object.assign(linkedProductsQuery, { data: [makeProduct(1), makeProduct(2)] });
    renderPage();
    expect(await screen.findByText('Product 1')).toBeInTheDocument();
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('paginates the linked-products table instead of rendering everything at once', async () => {
    Object.assign(linkedProductsQuery, { data: Array.from({ length: 25 }, (_, i) => makeProduct(i + 1)) });
    renderPage();
    await screen.findByText('Product 1');
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.queryByText('Product 25')).not.toBeInTheDocument();
  });

  it('adding a product happens in a dialog, not an always-open search box', async () => {
    const user = userEvent.setup();
    Object.assign(linkedProductsQuery, { data: [] });
    Object.assign(searchProductsQuery, { data: { items: [makeProduct(9)] } });
    renderPage();
    await screen.findByText('No products in this collection yet.');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add products' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByPlaceholderText('Search products to add…'), 'Product 9');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    expect(setProducts.mutate).toHaveBeenCalledWith({ id: 'c1', productIds: ['p9'] });
  });
});

describe('EditCollectionPage — rules panel (HYBRID/AUTOMATED)', () => {
  it('lists rules in a table with an edit/remove action, not stacked cards', async () => {
    Object.assign(collectionQuery, { data: hybridCollection });
    renderPage();
    expect(await screen.findByText('Price')).toBeInTheDocument();
    expect(screen.getByText('greater than or equal')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('adding a rule opens a dialog and appends it to the table on save', async () => {
    const user = userEvent.setup();
    Object.assign(collectionQuery, { data: { ...hybridCollection, rules: [] } });
    renderPage();
    await screen.findByText('No rules yet — this collection matches nothing.');

    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add rule' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Price')).toBeInTheDocument();
  });

  it('editing a rule pre-fills the dialog and updates the row on save', async () => {
    const user = userEvent.setup();
    Object.assign(collectionQuery, { data: hybridCollection });
    renderPage();
    await screen.findByText('Price');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('20')).toBeInTheDocument();
    // The Value field's control isn't label-associated (RuleValueEditor
    // renders a different input per field type and ignores Field's `p`) —
    // pick it as the second of the dialog's two number inputs (Group, then
    // Value for a PRICE rule).
    const valueInput = within(dialog).getAllByRole('spinbutton')[1];
    await user.clear(valueInput);
    await user.type(valueInput, '50');
    await user.click(within(dialog).getByRole('button', { name: 'Save rule' }));

    expect(await screen.findByText('50')).toBeInTheDocument();
  });

  it('"Save rules" persists the current draft to the server', async () => {
    const user = userEvent.setup();
    Object.assign(collectionQuery, { data: hybridCollection });
    renderPage();
    await screen.findByText('Price');

    await user.click(screen.getByRole('button', { name: 'Save rules' }));
    expect(setRules.mutateAsync).toHaveBeenCalledWith({
      id: 'c1',
      rules: [{ groupNumber: 0, field: 'PRICE', operator: 'GREATER_THAN_OR_EQUAL', value: 20 }],
    });
  });
});
