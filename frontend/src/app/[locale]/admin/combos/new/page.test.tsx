import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/api', () => ({
  combosApi: { createComboRule: vi.fn() },
}));

vi.mock('@/hooks/use-catalog', () => {
  // Stable query data, as in the real catalog hooks.
  const products = {
    items: [{ id: 'p1', nameEn: 'Test product', nameAr: 'منتج', sku: 'TEST', price: 12, variants: [{ sku: 'TEST-S', price: null }] }],
    total: 1,
    page: 1,
    pageSize: 60,
  };
  return {
    useAdminCollections: () => ({ data: [] }),
    useAdminCategories: () => ({ data: [] }),
    useProducts: () => ({ data: products }),
    useProduct: (id: string | undefined) => ({ data: products.items.find((p) => p.id === id) }),
  };
});

import { combosApi } from '@/lib/api';
import NewComboRulePage from './page';

const mock = vi.mocked(combosApi, true);

beforeEach(() => {
  vi.clearAllMocks();
  mock.createComboRule.mockResolvedValue({} as never);
});

async function fillTwoTiers() {
  const user = userEvent.setup();
  const { Wrapper } = createWrapper();
  render(<NewComboRulePage />, { wrapper: Wrapper });

  await user.type(screen.getByLabelText(/Name \(English\)/), 'Combo');
  await user.type(screen.getByLabelText(/Name \(Arabic\)/), 'عرض');
  await user.selectOptions(screen.getByLabelText('Product'), 'p1');
  await user.clear(screen.getByLabelText('Min qty'));
  await user.type(screen.getByLabelText('Min qty'), '3');
  await user.clear(screen.getByLabelText('Price per unit ($)'));
  await user.type(screen.getByLabelText('Price per unit ($)'), '10');
  await user.click(screen.getByRole('button', { name: 'Add tier' }));
  await user.clear(screen.getAllByLabelText('Min qty')[1]);
  await user.type(screen.getAllByLabelText('Min qty')[1], '5');
  await user.clear(screen.getAllByLabelText('Price per unit ($)')[1]);
  await user.type(screen.getAllByLabelText('Price per unit ($)')[1], '8.1');
  return user;
}

describe('NewComboRulePage', () => {
  it('submits rates without editable maxima or broad targets', async () => {
    const user = await fillTwoTiers();
    expect(screen.getByText('Range: 3\u20134')).toBeInTheDocument();
    expect(screen.getByText('Range: 5+')).toBeInTheDocument();
    expect(screen.queryByLabelText('Max qty')).not.toBeInTheDocument();
    expect(screen.queryByText('Applies to all')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add volume pricing rule' }));
    await waitFor(() => expect(mock.createComboRule).toHaveBeenCalledTimes(1));
    expect(mock.createComboRule).toHaveBeenCalledWith(expect.objectContaining({ productIds: ['p1'], appliesToAll: false,
      categoryTargets: [], collectionIds: [], tiers: [{ minQty: 3, price: 10 }, { minQty: 5, price: 8.1 }] }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/admin/combos'));
  });
  it('derives ranges when minima change or tiers are removed', async () => {
    const user = await fillTwoTiers();
    await user.clear(screen.getAllByLabelText('Min qty')[1]);
    await user.type(screen.getAllByLabelText('Min qty')[1], '6');
    expect(screen.getByText('Range: 3\u20135')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Remove tier' })[1]);
    expect(screen.getByText('Range: 3+')).toBeInTheDocument();
  });
  it('shows duplicate minima validation instead of silently doing nothing', async () => {
    const user = await fillTwoTiers();
    await user.clear(screen.getAllByLabelText('Min qty')[1]);
    await user.type(screen.getAllByLabelText('Min qty')[1], '3');
    await user.click(screen.getByRole('button', { name: 'Add volume pricing rule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Each band must have a different minimum quantity');
    expect(mock.createComboRule).not.toHaveBeenCalled();
  });
  it('shows boundary totals and preserves server rejection visibly', async () => {
    const user = await fillTwoTiers();
    await user.clear(screen.getAllByLabelText('Price per unit ($)')[1]);
    await user.type(screen.getAllByLabelText('Price per unit ($)')[1], '8');
    expect(screen.getByText(/4 .*40.00; 5 .*40.00/)).toHaveTextContent('Total must strictly increase.');
    mock.createComboRule.mockRejectedValue(new Error('4 x $10.00 = $40.00; 5 x $8.00 = $40.00. Total must strictly increase.'));
    await user.click(screen.getByRole('button', { name: 'Add volume pricing rule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('4 x $10.00 = $40.00; 5 x $8.00 = $40.00');
    expect(push).not.toHaveBeenCalled();
  });
});
