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
    items: [{ id: 'p1', nameEn: 'Test product', nameAr: 'منتج', sku: 'TEST' }],
    total: 1,
    page: 1,
    pageSize: 60,
  };
  return {
    useAdminCollections: () => ({ data: [] }),
    useAdminCategories: () => ({ data: [] }),
    useProducts: () => ({ data: products }),
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
  await user.click(screen.getByRole('checkbox', { name: 'Test product' }));
  await user.clear(screen.getByLabelText('Min qty'));
  await user.type(screen.getByLabelText('Min qty'), '3');
  await user.clear(screen.getByLabelText('Price ($)'));
  await user.type(screen.getByLabelText('Price ($)'), '5');
  await user.click(screen.getByRole('button', { name: 'Add tier' }));
  await user.clear(screen.getAllByLabelText('Min qty')[1]);
  await user.type(screen.getAllByLabelText('Min qty')[1], '5');
  await user.clear(screen.getAllByLabelText('Price ($)')[1]);
  await user.type(screen.getAllByLabelText('Price ($)')[1], '7');
  return user;
}

describe('NewComboRulePage', () => {
  it('submits automatic bounds for the 3-for-5 and 5-for-7 tiers', async () => {
    const user = await fillTwoTiers();
    expect(screen.getByText('Auto: 4')).toBeInTheDocument();
    expect(screen.getByText('No limit')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Max qty')[0]).toHaveValue(null);
    expect(screen.getAllByLabelText('Max qty')[1]).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: 'Add combo rule' }));
    await waitFor(() => expect(mock.createComboRule).toHaveBeenCalledTimes(1));
    expect(mock.createComboRule).toHaveBeenCalledWith(expect.objectContaining({
      productIds: ['p1'],
      tiers: [
        { minQty: 3, maxQty: 4, price: 5 },
        { minQty: 5, maxQty: null, price: 7 },
      ],
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/admin/combos'));
  });

  it('updates automatic bounds when tiers are added, changed, and removed', async () => {
    const user = await fillTwoTiers();
    await user.click(screen.getByRole('button', { name: 'Add tier' }));
    await user.clear(screen.getAllByLabelText('Min qty')[2]);
    await user.type(screen.getAllByLabelText('Min qty')[2], '8');
    expect(screen.getByText('Auto: 4')).toBeInTheDocument();
    expect(screen.getByText('Auto: 7')).toBeInTheDocument();

    await user.clear(screen.getAllByLabelText('Min qty')[1]);
    await user.type(screen.getAllByLabelText('Min qty')[1], '6');
    expect(screen.getByText('Auto: 5')).toBeInTheDocument();
    expect(screen.getByText('Auto: 7')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Remove tier' })[2]);
    expect(screen.queryByText('Auto: 7')).not.toBeInTheDocument();
    expect(screen.getByText('No limit')).toBeInTheDocument();

    await user.type(screen.getAllByLabelText('Max qty')[0], '3');
    await user.clear(screen.getAllByLabelText('Min qty')[1]);
    await user.type(screen.getAllByLabelText('Min qty')[1], '8');
    expect(screen.getAllByLabelText('Max qty')[0]).toHaveValue(3);
    expect(screen.queryByText('Auto: 7')).not.toBeInTheDocument();
    await user.clear(screen.getAllByLabelText('Max qty')[0]);
    expect(screen.getByText('Auto: 7')).toBeInTheDocument();
  });

  it('still shows explicit overlaps, then submits after the ranges are corrected', async () => {
    const user = await fillTwoTiers();
    await user.type(screen.getAllByLabelText('Max qty')[0], '5');

    await user.click(screen.getByRole('button', { name: 'Add combo rule' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tiers must not have overlapping quantity ranges');
    expect(mock.createComboRule).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    await user.clear(screen.getAllByLabelText('Max qty')[0]);
    await user.type(screen.getAllByLabelText('Max qty')[0], '4');
    await user.click(screen.getByRole('button', { name: 'Add combo rule' }));

    await waitFor(() => expect(mock.createComboRule).toHaveBeenCalledTimes(1));
    expect(mock.createComboRule).toHaveBeenCalledWith(expect.objectContaining({
      nameEn: 'Combo',
      nameAr: 'عرض',
      productIds: ['p1'],
      tiers: [
        { minQty: 3, maxQty: 4, price: 5 },
        { minQty: 5, maxQty: null, price: 7 },
      ],
    }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/admin/combos'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
