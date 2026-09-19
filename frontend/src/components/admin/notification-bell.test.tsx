import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/lib/api', () => ({
  notificationsApi: {
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}));

import { notificationsApi } from '@/lib/api';
import { NotificationBell } from './notification-bell';

const mock = vi.mocked(notificationsApi, true);

const notification = {
  id: 'n1',
  type: 'order.flagged',
  title: 'Order flagged',
  body: 'Order AS-1 was flagged for review',
  url: '/en/admin/orders?status=flagged',
  entityType: 'order',
  entityID: 'o1',
  dateCreated: '2026-09-17T10:00:00.000Z',
  read: false,
};

function renderBell() {
  const { Wrapper } = createWrapper();
  return render(<NotificationBell locale="en" />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.listNotifications.mockResolvedValue({ notifications: [notification], unreadCount: 1 });
  mock.markNotificationRead.mockResolvedValue(undefined);
  mock.markAllNotificationsRead.mockResolvedValue(undefined);
});

describe('NotificationBell', () => {
  it('renders the unread count badge', async () => {
    renderBell();
    expect(await screen.findByText('1')).toBeInTheDocument();
  });

  it('opens the feed, marks the clicked item read, and navigates to its url', async () => {
    const user = userEvent.setup();
    renderBell();
    await screen.findByText('1');

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByText('Order flagged'));

    expect(mock.markNotificationRead).toHaveBeenCalledWith('n1');
    expect(push).toHaveBeenCalledWith('/en/admin/orders?status=flagged');
    expect(screen.queryByText('Order flagged')).not.toBeInTheDocument();
  });

  it('closes the feed on outside click', async () => {
    const user = userEvent.setup();
    renderBell();
    await screen.findByText('1');

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('Order flagged')).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByText('Order flagged')).not.toBeInTheDocument();
  });
});
