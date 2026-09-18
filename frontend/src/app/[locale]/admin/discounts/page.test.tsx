import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import type { AuthUser } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => ({
  discountsApi: {
    listPromotions: vi.fn(),
    listCoupons: vi.fn(),
    deletePromotion: vi.fn(),
    updatePromotion: vi.fn(),
    createPromotion: vi.fn(),
    deleteCoupon: vi.fn(),
  },
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
  maxRedemptions: null,
  maxPerCustomer: null,
  timesRedeemed: 0,
  dateCreated: '2026-09-01T00:00:00.000Z',
};

function renderPage(user?: Partial<AuthUser>) {
  const { Wrapper, store } = createWrapper();
  if (user) {
    store.dispatch({
      type: 'auth/authenticated',
      payload: {
        id: 'admin1',
        name: 'Boss',
        email: 'boss@test.dev',
        phone: null,
        role: 'ADMIN',
        ...user,
      } satisfies AuthUser,
    });
  }
  return render(<AdminDiscountsPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.listPromotions.mockResolvedValue([promotion] as never);
  mock.listCoupons.mockResolvedValue([coupon] as never);
});

describe('AdminDiscountsPage (list)', () => {
  it('lists promotions on the first tab, each linking to its own edit page', async () => {
    renderPage();
    expect(await screen.findByText('Summer sale')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '15%' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'All items' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/en/admin/discounts/promotions/p1'
    );
  });

  it('links "New promotion" to the create page rather than an inline form', async () => {
    renderPage({ permissions: ['discounts:view', 'discounts:manage'] });
    await screen.findByText('Summer sale');
    expect(screen.getByRole('link', { name: /New promotion/ })).toHaveAttribute(
      'href',
      '/en/admin/discounts/promotions/new'
    );
  });

  it('switches to the Coupons tab and lists coupons, linking Edit to its own page', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Summer sale');

    await user.click(screen.getByRole('button', { name: 'Coupons' }));
    expect(await screen.findByText('WELCOME10')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/en/admin/discounts/coupons/c1');
  });
});
