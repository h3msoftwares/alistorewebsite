import { expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createWrapper, makeAuthedStore } from '@/test/utils';
import { ReturnWorkCards } from './return-work-cards';
import { ordersApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({ ordersApi: { adminReturnWork: vi.fn() } }));

it('shows request counts and amounts with links to the appropriate filters', async () => {
  vi.mocked(ordersApi.adminReturnWork).mockResolvedValue({ awaitingApproval: { count: 2, amountCents: 4000 },
    inTransit: { count: 1, amountCents: 2000 }, awaitingRefundMarking: { count: 4, amountCents: 15000 } });
  const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions: ['orders:view'] }));
  render(<ReturnWorkCards locale="en" />, { wrapper: Wrapper });
  const tile = await screen.findByRole('link', { name: /Return requests awaiting approval/ });
  expect(tile).toHaveAttribute('href', '/en/admin/orders?returnFilter=AWAITING_APPROVAL');
  expect(within(tile).getByText('2')).toBeInTheDocument();
  expect(within(tile).getByText('$40.00')).toBeInTheDocument();
  const waiting = screen.getByRole('link', { name: /Received returns awaiting refund marking/ });
  expect(within(waiting).getByText('4')).toBeInTheDocument();
  expect(within(waiting).getByText('$150.00')).toBeInTheDocument();
});

it('does not expose return work without orders:view', () => {
  const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions: ['dashboard:view'] }));
  render(<ReturnWorkCards locale="en" />, { wrapper: Wrapper });
  expect(screen.queryByText('Return and refund work')).not.toBeInTheDocument();
});
