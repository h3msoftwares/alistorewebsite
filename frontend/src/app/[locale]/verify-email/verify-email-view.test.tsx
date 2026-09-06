import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { ApiError } from '@/lib/api';
import { VerifyEmailView } from './verify-email-view';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const verify = { mutate: vi.fn(), isSuccess: false, isError: false, error: null as unknown };
const resend = { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false };
vi.mock('@/hooks/use-auth', () => ({
  useVerifyEmail: () => verify,
  useResendVerification: () => resend,
}));

const renderView = (token = 'tok-123') => {
  const { Wrapper } = createWrapper();
  return render(<VerifyEmailView locale="en" token={token} />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(verify, { mutate: vi.fn(), isSuccess: false, isError: false, error: null });
  Object.assign(resend, { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false });
});

describe('<VerifyEmailView>', () => {
  it('fires the verify call once on mount with the token', async () => {
    renderView('tok-abc');
    await waitFor(() => expect(verify.mutate).toHaveBeenCalledWith({ token: 'tok-abc' }));
    expect(verify.mutate).toHaveBeenCalledTimes(1);
  });

  it('with no token: shows the invalid-link state and does not call verify', () => {
    renderView('');
    expect(screen.getByText('Invalid verification link')).toBeInTheDocument();
    expect(verify.mutate).not.toHaveBeenCalled();
  });

  it('while pending: shows a "verifying" message', () => {
    renderView();
    expect(screen.getByText(/Verifying your email/i)).toBeInTheDocument();
  });

  it('on success: shows the confirmation + a link to sign in (no auto-login)', () => {
    verify.isSuccess = true;
    renderView();
    expect(screen.getByText(/Your email has been verified/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/en/login');
  });

  it('on a 401: shows the expired-link state with a resend form', async () => {
    const user = userEvent.setup();
    verify.isError = true;
    verify.error = new ApiError(401, { code: 'UNAUTHORIZED', message: 'Invalid or expired verification link' });
    renderView();

    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'a@x.dev');
    await user.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(resend.mutateAsync).toHaveBeenCalledWith({ email: 'a@x.dev', locale: 'en' });
    expect(await screen.findByText(/sent a fresh link/i)).toBeInTheDocument();
  });
});
