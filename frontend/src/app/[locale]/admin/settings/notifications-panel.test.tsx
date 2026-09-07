import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: vi.fn() }));

import { usePushNotifications } from '@/hooks/use-push-notifications';
import { NotificationsPanel } from './notifications-panel';

const mockUsePush = vi.mocked(usePushNotifications);

const subscribe = vi.fn();
const unsubscribe = vi.fn();

beforeEach(() => {
  subscribe.mockReset();
  unsubscribe.mockReset();
});

describe('NotificationsPanel', () => {
  it('shows a loading skeleton while the initial check is pending (state === null)', () => {
    mockUsePush.mockReturnValue({ state: null, busy: false, error: null, subscribe, unsubscribe });
    render(<NotificationsPanel locale="en" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('unsupported: explains why, shows no toggle', () => {
    mockUsePush.mockReturnValue({ state: 'unsupported', busy: false, error: null, subscribe, unsubscribe });
    render(<NotificationsPanel locale="en" />);
    expect(screen.getByText(/doesn't support push notifications/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('blocked: explains how to fix it, shows no toggle', () => {
    mockUsePush.mockReturnValue({ state: 'blocked', busy: false, error: null, subscribe, unsubscribe });
    render(<NotificationsPanel locale="en" />);
    expect(screen.getByText(/blocked for this site/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('off: shows an Enable button that calls subscribe() on click', async () => {
    mockUsePush.mockReturnValue({ state: 'off', busy: false, error: null, subscribe, unsubscribe });
    const user = userEvent.setup();
    render(<NotificationsPanel locale="en" />);

    const button = screen.getByRole('button', { name: /enable order alerts/i });
    await user.click(button);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('on: shows a confirmation and a "turn off" button that calls unsubscribe() on click', async () => {
    mockUsePush.mockReturnValue({ state: 'on', busy: false, error: null, subscribe, unsubscribe });
    const user = userEvent.setup();
    render(<NotificationsPanel locale="en" />);

    expect(screen.getByText(/order alerts are on for this device/i)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /turn off/i });
    await user.click(button);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('surfaces the hook’s error message when present', () => {
    mockUsePush.mockReturnValue({
      state: 'off',
      busy: false,
      error: 'Could not enable notifications. Try again.',
      subscribe,
      unsubscribe,
    });
    render(<NotificationsPanel locale="en" />);
    expect(screen.getByText('Could not enable notifications. Try again.')).toBeInTheDocument();
  });
});

// NOT covered here: whether a real browser actually shows its native
// permission dialog, or whether it treats this click as a valid "user
// gesture" — both are properties of the real browser/OS, not of this
// component or the mocked hook, and jsdom has no model of either. That gap
// was closed by manual verification in real browsers instead (see the
// session's live-test notes), not simulated in a unit test.
