import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import type { AuthUser } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
}));

vi.mock('@/lib/api', () => ({
  combosApi: {
    listComboRules: vi.fn(),
    deleteComboRule: vi.fn(),
    updateComboRule: vi.fn(),
    createComboRule: vi.fn(),
  },
}));

import { combosApi } from '@/lib/api';
import AdminCombosPage from './page';

const mock = vi.mocked(combosApi, true);

const comboRule = {
  id: 'r1',
  pricingModel: 'UNIT_RATE_BANDS', nameEn: 'Volume',
  nameAr: 'قطعتان بـ 5$',
  status: 'ACTIVE' as const,
  priority: 0,
  appliesToAll: false,
  startsAt: null,
  endsAt: null,
  dateCreated: '2026-09-01T00:00:00.000Z',
  tiers: [{ minQty: 2, maxQty: 2, price: 5 }],
  products: [{ productID: 'p1' }],
  categories: [],
  collections: [],
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
  return render(<AdminCombosPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.listComboRules.mockResolvedValue([comboRule] as never);
});

describe('AdminCombosPage (list)', () => {
  it('lists volume pricing rules, showing their tier schedule, each linking to its own edit page', async () => {
    renderPage();
    expect(await screen.findByText('Volume')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1 product(s)' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2+: $5.00 per unit' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/en/admin/combos/r1');
  });

  it('links "New volume pricing rule" to the create page only when the user can manage combos', async () => {
    renderPage({ permissions: ['combos:view'] });
    await screen.findByText('Volume');
    expect(screen.queryByRole('link', { name: /New volume pricing rule/ })).not.toBeInTheDocument();

    renderPage({ permissions: ['combos:view', 'combos:manage'] });
    await screen.findAllByText('Volume');
    expect(screen.getAllByRole('link', { name: /New volume pricing rule/ })[0]).toHaveAttribute(
      'href',
      '/en/admin/combos/new'
    );
  });
});
