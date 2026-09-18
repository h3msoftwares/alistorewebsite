import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { LoyaltyRulesPanel } from './loyalty-panel';
import type { AuthUser, LoyaltyRule } from '@/lib/types';

const create = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const update = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const remove = { mutate: vi.fn(), isPending: false };

const rule: LoyaltyRule = {
  id: 'r1',
  nameEn: 'Every 5 orders',
  nameAr: 'كل 5 طلبات',
  metric: 'ORDER_COUNT',
  threshold: '5',
  isActive: true,
  rewardType: 'PERCENT',
  rewardValue: '10',
  couponValidDays: null,
  dateCreated: '2026-01-01T00:00:00.000Z',
};

const rulesQuery: { data: LoyaltyRule[]; isPending: boolean; isError: boolean } = {
  data: [rule],
  isPending: false,
  isError: false,
};

vi.mock('@/hooks/use-loyalty', () => ({
  useLoyaltyRules: () => rulesQuery,
  useCreateLoyaltyRule: () => create,
  useUpdateLoyaltyRule: () => update,
  useDeleteLoyaltyRule: () => remove,
}));

// Every test here exercises create/edit/delete, so the panel is rendered as
// an admin who holds loyalty:manage (the permission gate added alongside the
// rest of the admin panel's :manage-gating consistency pass).
function renderPanel() {
  const { Wrapper, store } = createWrapper();
  store.dispatch({
    type: 'auth/authenticated',
    payload: {
      id: 'admin1',
      name: 'Boss',
      email: 'boss@test.dev',
      phone: null,
      role: 'ADMIN',
      permissions: ['loyalty:view', 'loyalty:manage'],
    } satisfies AuthUser,
  });
  return render(<LoyaltyRulesPanel isAr={false} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(rulesQuery, { data: [rule], isPending: false, isError: false });
});

describe('<LoyaltyRulesPanel>', () => {
  it('lists existing rules with their milestone and reward', () => {
    renderPanel();
    expect(screen.getByText('Every 5 orders')).toBeInTheDocument();
    expect(screen.getByText('Every 5 delivered orders')).toBeInTheDocument();
    expect(screen.getByText('10% off')).toBeInTheDocument();
  });

  it('shows an empty state when there are no rules', () => {
    Object.assign(rulesQuery, { data: [] });
    renderPanel();
    expect(screen.getByText('No loyalty rules yet')).toBeInTheDocument();
  });

  it('creates a new rule from the dialog', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'New rule' }));
    await user.type(screen.getByLabelText(/Name \(English\)/), 'Every 3 orders');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/), 'كل 3 طلبات');
    await user.click(screen.getByRole('button', { name: 'Add rule' }));

    expect(create.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nameEn: 'Every 3 orders', nameAr: 'كل 3 طلبات', metric: 'ORDER_COUNT', threshold: 5 })
    );
  });

  it('rejects a percentage reward over 100 client-side', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'New rule' }));
    await user.type(screen.getByLabelText(/Name \(English\)/), 'x');
    await user.type(screen.getByLabelText(/Name \(Arabic\)/), 'x');
    const rewardValue = screen.getByLabelText('Reward value');
    await user.clear(rewardValue);
    await user.type(rewardValue, '150');
    await user.click(screen.getByRole('button', { name: 'Add rule' }));

    expect(await screen.findByText('A percentage is 0–100')).toBeInTheDocument();
    expect(create.mutateAsync).not.toHaveBeenCalled();
  });

  it('edits a rule from the dialog', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(update.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1', body: expect.objectContaining({ nameEn: 'Every 5 orders' }) })
    );
  });

  it('deletes a rule after confirming', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    expect(remove.mutate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(remove.mutate).toHaveBeenCalledWith('r1');
  });
});
