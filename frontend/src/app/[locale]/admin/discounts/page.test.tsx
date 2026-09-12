import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en' }) }));

vi.mock('@/lib/api', () => ({
  discountsApi: {
    listPromotions: vi.fn(),
    createPromotion: vi.fn(),
    updatePromotion: vi.fn(),
    deletePromotion: vi.fn(),
    listCoupons: vi.fn(),
    createCoupon: vi.fn(),
    updateCoupon: vi.fn(),
    deleteCoupon: vi.fn(),
  },
}));

vi.mock('@/hooks/use-catalog', () => ({
  useAdminCollections: () => ({ data: [] }),
  useAdminCategories: () => ({ data: [] }),
  useProducts: () => ({ data: { items: [], total: 0, page: 1, pageSize: 500 } }),
}));

import { discountsApi } from '@/lib/api';
import AdminDiscountsPage from './page';

const mock = vi.mocked(discountsApi, true);

const promotion = {
  id: 'p1',
  nameEn: 'Summer sale',
  nameAr: 'تخفيضات',
  status: 'ACTIVE' as const,
  type: 'PERCENT' as const,
  value: 15,
  priority: 0,
  stackable: true,
  appliesToAll: true,
  startsAt: null,
  endsAt: null,
  dateCreated: '2026-09-01T00:00:00.000Z',
  products: [],
  categories: [],
  collections: [],
};
const coupon = {
  id: 'c1',
  code: 'WELCOME10',
  type: 'AMOUNT' as const,
  value: 10,
  isActive: true,
  startsAt: null,
  endsAt: null,
  dateCreated: '2026-09-01T00:00:00.000Z',
};

function renderPage() {
  const { Wrapper } = createWrapper();
  return render(<AdminDiscountsPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.listPromotions.mockResolvedValue([promotion] as never);
  mock.listCoupons.mockResolvedValue([coupon] as never);
  mock.createPromotion.mockResolvedValue(promotion as never);
});

describe('AdminDiscountsPage', () => {
  it('lists promotions on the first tab', async () => {
    renderPage();
    expect(await screen.findByText('Summer sale')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '15%' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'All items' })).toBeInTheDocument();
  });

  it('switches to the Coupons tab and lists coupons', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Summer sale');

    await user.click(screen.getByRole('button', { name: 'Coupons' }));
    expect(await screen.findByText('WELCOME10')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
  });

  it('submits a new promotion that applies to all items', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Summer sale');

    await user.type(screen.getByLabelText(/Name \(English\)/), 'Flash');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/), 'فلاش');
    await user.click(screen.getByLabelText('Applies to all items'));
    await user.click(screen.getByRole('button', { name: 'Add promotion' }));

    await waitFor(() => expect(mock.createPromotion).toHaveBeenCalled());
    expect(mock.createPromotion.mock.calls[0][0]).toMatchObject({
      nameEn: 'Flash',
      appliesToAll: true,
      type: 'PERCENT',
    });
  });

  it('rejects a promotion with no target and not applying to all items', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Summer sale');

    await user.type(screen.getByLabelText(/Name \(English\)/), 'Flash');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/), 'فلاش');
    await user.click(screen.getByRole('button', { name: 'Add promotion' }));

    expect(await screen.findByText(/Pick at least one target/)).toBeInTheDocument();
    expect(mock.createPromotion).not.toHaveBeenCalled();
  });
});
