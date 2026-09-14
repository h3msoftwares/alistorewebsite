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
  discountsApi: {
    createPromotion: vi.fn(),
  },
}));

vi.mock('@/hooks/use-catalog', () => ({
  useAdminCollections: () => ({ data: [] }),
  useAdminCategories: () => ({ data: [] }),
  useProducts: () => ({ data: { items: [], total: 0, page: 1, pageSize: 500 } }),
}));

import { discountsApi } from '@/lib/api';
import NewPromotionPage from './page';

const mock = vi.mocked(discountsApi, true);

function renderPage() {
  const { Wrapper } = createWrapper();
  return render(<NewPromotionPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NewPromotionPage', () => {
  it('submits a new promotion that applies to all items and navigates back to the list', async () => {
    mock.createPromotion.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderPage();

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
    await waitFor(() => expect(push).toHaveBeenCalledWith('/en/admin/discounts'));
  });

  it('rejects a promotion with no target and not applying to all items', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Name \(English\)/), 'Flash');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/), 'فلاش');
    await user.click(screen.getByRole('button', { name: 'Add promotion' }));

    expect(await screen.findByText(/Pick at least one target/)).toBeInTheDocument();
    expect(mock.createPromotion).not.toHaveBeenCalled();
  });
});
