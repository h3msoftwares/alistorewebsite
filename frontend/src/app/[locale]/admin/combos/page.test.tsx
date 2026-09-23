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
  nameEn: '2 for $5',
  nameAr: 'قطعتان بـ 5$',
  status: 'ACTIVE' as const,
  priority: 0,
  appliesToAll: true,
  startsAt: null,
  endsAt: null,
  dateCreated: '2026-09-01T00:00:00.000Z',
  tiers: [{ minQty: 2, maxQty: 2, price: 5 }],
  products: [],
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
  it('lists combo rules, showing their tier schedule, each linking to its own edit page', async () => {
    renderPage();
    expect(await screen.findByText('2 for $5')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'All items' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2 for $5.00' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/en/admin/combos/r1');
  });

  it('links "New combo rule" to the create page only when the user can manage combos', async () => {
    renderPage({ permissions: ['combos:view'] });
    await screen.findByText('2 for $5');
    expect(screen.queryByRole('link', { name: /New combo rule/ })).not.toBeInTheDocument();

    renderPage({ permissions: ['combos:view', 'combos:manage'] });
    await screen.findAllByText('2 for $5');
    expect(screen.getAllByRole('link', { name: /New combo rule/ })[0]).toHaveAttribute(
      'href',
      '/en/admin/combos/new'
    );
  });
});
