import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { LogoutButton } from './logout-button';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const logout = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
vi.mock('@/hooks/use-auth', () => ({ useLogout: () => logout }));

const renderBtn = (props: Partial<{ locale: string; variant: 'nav' | 'button'; onDone: () => void }> = {}) => {
  const { Wrapper } = createWrapper();
  return render(
    <LogoutButton locale={props.locale ?? 'en'} variant={props.variant} onDone={props.onDone} />,
    { wrapper: Wrapper }
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(logout, { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });
});

describe('<LogoutButton>', () => {
  it('runs the logout mutation, then redirects to the locale home', async () => {
    const user = userEvent.setup();
    renderBtn({ locale: 'ar' });
    await user.click(screen.getByRole('button', { name: 'تسجيل الخروج' }));
    expect(logout.mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ar'));
  });

  it('still closes the menu + redirects even if the logout request fails', async () => {
    const user = userEvent.setup();
    logout.mutateAsync = vi.fn().mockRejectedValue(new Error('network'));
    const onDone = vi.fn();
    renderBtn({ onDone });
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => {
      expect(onDone).toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith('/en');
    });
  });

  it('nav variant renders on the drawer-nav-link class', () => {
    renderBtn({ variant: 'nav' });
    expect(screen.getByRole('button', { name: 'Log out' })).toHaveClass('drawer__nav-link');
  });
});
