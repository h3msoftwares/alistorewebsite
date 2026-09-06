import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { ResetPasswordForm } from './reset-password-form';
import { rememberResetReturn } from '@/lib/reset-return';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const reset = { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false };
vi.mock('@/hooks/use-auth', () => ({ useResetPassword: () => reset }));

const renderForm = () => {
  const { Wrapper } = createWrapper();
  return render(<ResetPasswordForm locale="en" token="tok-123" />, { wrapper: Wrapper });
};

async function submitNewPassword() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
  await user.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
  await user.click(screen.getByRole('button', { name: 'Reset password' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.assign(reset, { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false });
});

describe('<ResetPasswordForm> — success destination', () => {
  it('normal logged-out flow: shows "Go to sign in", no redirect', async () => {
    renderForm();
    await submitNewPassword();

    expect(await screen.findByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/en/login');
    expect(replace).not.toHaveBeenCalled();
  });

  it('flow started from the account page: redirects to /account, no "Go to sign in"', async () => {
    rememberResetReturn('/en/account');
    renderForm();
    await submitNewPassword();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/en/account'));
    expect(screen.queryByRole('link', { name: 'Go to sign in' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/en/account');
    // hint is consumed — a later reset won't redirect
    expect(window.localStorage.getItem('alistore:reset-return')).toBeNull();
  });
});
