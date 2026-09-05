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
vi.mock('@/hooks/use-auth', () => ({ useLogin: () => login }));

const renderForm = (props: Partial<{ locale: 'en' | 'ar'; next: string | null }> = {}) => {
  const { Wrapper } = createWrapper();
  return render(<LoginForm locale={props.locale ?? 'en'} next={props.next ?? null} />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(login, { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false, isError: false, error: null });
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
});
