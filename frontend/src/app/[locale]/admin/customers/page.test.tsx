import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import type { AuthUser } from '@/lib/types';

vi.mock('next/navigation', () => ({ useParams: () => ({ locale: 'en' }) }));

vi.mock('@/lib/api', () => ({
  customersApi: {
    adminListCustomers: vi.fn(),
    adminGetCustomer: vi.fn(),
    adminSetCustomerActive: vi.fn(),
  },
}));

import { customersApi } from '@/lib/api';
import AdminCustomersPage from './page';

const mock = vi.mocked(customersApi, true);

const summary = {
  id: 'c1',
  name: 'Lina Haddad',
  email: 'lina@test.dev',
  phone: '+9611234567',
  isActive: true,
  emailVerified: true,
  joinedAt: '2026-02-01T09:00:00.000Z',
  orderCount: 3,
  paidOrderCount: 2,
  totalSpent: '120.5',
  lastOrderAt: '2026-06-01T09:00:00.000Z',
};

const detail = {
  ...summary,
  orders: [
    {
      id: 'o1',
      orderNumber: 'AS-20260601-AAA111',
      total: '80.5',
      status: 'DELIVERED',
      dateCreated: '2026-06-01T09:00:00.000Z',
      items: [{ id: 'i1', quantity: 2 }],
    },
  ],
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
  return render(<AdminCustomersPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.adminListCustomers.mockResolvedValue({
    customers: [summary],
    total: 1,
    page: 1,
    pageSize: 20,
  } as never);
  mock.adminGetCustomer.mockResolvedValue(detail as never);
  mock.adminSetCustomerActive.mockResolvedValue({ ...summary, isActive: false } as never);
});

describe('AdminCustomersPage', () => {
  it('renders a customer row with contact info, join date, orders and spend', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Lina Haddad' })).toBeInTheDocument();
    expect(screen.getByText(/lina@test\.dev · \+9611234567/)).toBeInTheDocument();
    expect(screen.getByText('$120.50')).toBeInTheDocument();
    // order count shows total (3) with the paid count (2) alongside
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('expanding a row loads and shows that customer’s orders', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Lina Haddad' }));
    await waitFor(() => expect(mock.adminGetCustomer).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText('AS-20260601-AAA111')).toBeInTheDocument();
  });

  it('debounced search refetches with the term', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'Lina Haddad' });

    await user.type(screen.getByPlaceholderText('Search customers…'), 'haddad');
    await waitFor(
      () =>
        expect(mock.adminListCustomers).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: 'haddad', page: 1 })
        ),
      { timeout: 2000 }
    );
  });

  it('the status filter refetches with that status', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'Lina Haddad' });

    await user.selectOptions(screen.getByLabelText('Status'), 'inactive');
    await waitFor(() =>
      expect(mock.adminListCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'inactive' })
      )
    );
  });

  it('the sort control refetches with that ordering', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'Lina Haddad' });

    await user.selectOptions(screen.getByLabelText('Sort by'), 'orders');
    await waitFor(() =>
      expect(mock.adminListCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'orders' })
      )
    );
  });

  it('Block asks for confirmation first, then blocks the account', async () => {
    const user = userEvent.setup();
    renderPage({ permissions: ['customers:view', 'customers:manage'] });
    await screen.findByRole('button', { name: 'Lina Haddad' });

    await user.click(screen.getByRole('button', { name: 'Block' }));
    const dialog = await screen.findByRole('dialog');
    expect(mock.adminSetCustomerActive).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Block customer' }));
    await waitFor(() =>
      expect(mock.adminSetCustomerActive).toHaveBeenCalledWith('c1', false)
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancelling the confirm dialog leaves the customer untouched', async () => {
    const user = userEvent.setup();
    renderPage({ permissions: ['customers:view', 'customers:manage'] });
    await screen.findByRole('button', { name: 'Lina Haddad' });

    await user.click(screen.getByRole('button', { name: 'Block' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(mock.adminSetCustomerActive).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Unblock applies immediately with no confirm dialog', async () => {
    const user = userEvent.setup();
    mock.adminListCustomers.mockResolvedValue({
      customers: [{ ...summary, isActive: false }],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);
    renderPage({ permissions: ['customers:view', 'customers:manage'] });
    await screen.findByRole('button', { name: 'Lina Haddad' });

    await user.click(screen.getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(mock.adminSetCustomerActive).toHaveBeenCalledWith('c1', true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the manage controls without customers:manage', async () => {
    renderPage({ permissions: ['customers:view'] });
    await screen.findByRole('button', { name: 'Lina Haddad' });
    expect(screen.queryByRole('button', { name: 'Block' })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no customers', async () => {
    mock.adminListCustomers.mockResolvedValue({
      customers: [],
      total: 0,
      page: 1,
      pageSize: 20,
    } as never);
    renderPage();
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
  });

  it('shows a blocked badge for an inactive customer', async () => {
    mock.adminListCustomers.mockResolvedValue({
      customers: [{ ...summary, isActive: false }],
      total: 1,
      page: 1,
      pageSize: 20,
    } as never);
    renderPage();
    expect(await screen.findByText('Blocked')).toBeInTheDocument();
  });
});
