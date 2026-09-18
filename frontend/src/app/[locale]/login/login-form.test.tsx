import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { ApiError } from '@/lib/api';
import { LoginForm } from './login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const login = {
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
};
const resend = { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false };
vi.mock('@/hooks/use-auth', () => ({
  useLogin: () => login,
  useResendVerification: () => resend,
}));

const renderForm = (props: Partial<{ locale: 'en' | 'ar'; next: string | null }> = {}) => {
  const { Wrapper } = createWrapper();
  return render(<LoginForm locale={props.locale ?? 'en'} next={props.next ?? null} />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(login, { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false, isError: false, error: null });
  Object.assign(resend, { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false });
});

describe('<LoginForm>', () => {
  it('renders the sign-in form with links to reset + register', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/en/forgot-password');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/en/register');
  });

  it('submits the identifier + password and redirects home on success', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Email or phone'), 'a@x.dev');
    await user.type(screen.getByLabelText('Password'), 'secret12');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(login.mutateAsync).toHaveBeenCalledWith({ identifier: 'a@x.dev', password: 'secret12' });
    expect(replace).toHaveBeenCalledWith('/en');
  });

  it('follows a genuine same-origin ?next= path', async () => {
    const user = userEvent.setup();
    renderForm({ next: '/en/checkout' });
    await user.type(screen.getByLabelText('Email or phone'), 'a@x.dev');
    await user.type(screen.getByLabelText('Password'), 'secret12');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(replace).toHaveBeenCalledWith('/en/checkout');
  });

  it('never follows an open-redirect ?next= — falls back to the locale home', async () => {
    const user = userEvent.setup();
    const attacks = [
      'https://evil.example/steal',
      '//evil.example',
      '/\\evil.example', // browser normalises "\" to "/", making this "//evil.example"
      '/%2F%2Fevil.example',
      'javascript:alert(1)',
      '/\tevil', // whitespace a browser strips
      'evil.example',
    ];
    for (const next of attacks) {
      replace.mockClear();
      const { unmount } = renderForm({ next });
      await user.type(screen.getByLabelText('Email or phone'), 'a@x.dev');
      await user.type(screen.getByLabelText('Password'), 'secret12');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(replace, `next=${JSON.stringify(next)}`).toHaveBeenCalledWith('/en');
      unmount();
    }
  });

  it('shows a generic error message on a failed sign-in (no cause disclosed)', () => {
    login.isError = true;
    login.error = new ApiError(401, { code: 'UNAUTHORIZED', message: 'Invalid credentials' });
    renderForm();
    expect(screen.getByText('Invalid email/phone or password.')).toBeInTheDocument();
  });

  it('shows a distinct "too many attempts" message when rate limited', () => {
    login.isError = true;
    login.error = new ApiError(429, { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' });
    renderForm();
    expect(screen.getByText(/Too many attempts/i)).toBeInTheDocument();
  });

  it("shows a distinct message (not silence) when the server can't be reached at all", () => {
    login.isError = true;
    login.error = new TypeError('Failed to fetch');
    renderForm();
    expect(screen.getByText(/Couldn't reach the server/i)).toBeInTheDocument();
  });

  it('on a 403 "email not verified" shows the verify notice + a resend form pre-filled with the email', async () => {
    const user = userEvent.setup();
    const err403 = new ApiError(403, {
      code: 'FORBIDDEN',
      message: 'Please verify your email address before signing in.',
    });
    login.mutateAsync = vi.fn().mockRejectedValue(err403);
    login.isError = true;
    login.error = err403;
    renderForm();

    await user.type(screen.getByLabelText('Email or phone'), 'a@x.dev');
    await user.type(screen.getByLabelText('Password'), 'secret12');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/needs to be verified/i)).toBeInTheDocument();
    // the resend email field is pre-filled from the submitted identifier
    expect(screen.getByLabelText('Email')).toHaveValue('a@x.dev');

    await user.click(screen.getByRole('button', { name: /Resend verification email/i }));
    expect(resend.mutateAsync).toHaveBeenCalledWith({ email: 'a@x.dev', locale: 'en' });
    expect(await screen.findByText(/sent a fresh verification link/i)).toBeInTheDocument();
  });

  it('on a 403 "account_blocked" shows the admin-blocked notice — not the verify/resend UI', () => {
    login.isError = true;
    login.error = new ApiError(403, {
      code: 'FORBIDDEN',
      message: 'Your account has been blocked by an administrator. Please contact support if you think this is a mistake.',
      meta: { reason: 'account_blocked' },
    });
    renderForm();

    expect(screen.getByText(/blocked by an administrator/i)).toBeInTheDocument();
    expect(screen.queryByText(/needs to be verified/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resend verification email/i })).not.toBeInTheDocument();
  });
});
