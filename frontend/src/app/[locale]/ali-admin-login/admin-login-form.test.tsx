import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminLoginForm } from './admin-login-form';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));

const adminLogin = { mutateAsync: vi.fn(), isPending: false, isError: false };
const auth = { isAdmin: false };
vi.mock('@/hooks/use-auth', () => ({
  useAdminLogin: () => adminLogin,
  useAuth: () => auth,
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(adminLogin, { mutateAsync: vi.fn(), isPending: false, isError: false });
  auth.isAdmin = false;
});

describe('<AdminLoginForm>', () => {
  it('requires both fields', async () => {
    const user = userEvent.setup();
    render(<AdminLoginForm locale="en" />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findAllByText('Required')).toHaveLength(2);
    expect(adminLogin.mutateAsync).not.toHaveBeenCalled();
  });

  it('submits identifier + password and redirects to /admin on success', async () => {
    adminLogin.mutateAsync.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AdminLoginForm locale="en" />);

    await user.type(screen.getByLabelText('Email or phone'), 'admin@test.dev');
    await user.type(screen.getByLabelText('Password'), 'Sup3rSecret!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(adminLogin.mutateAsync).toHaveBeenCalledWith({ identifier: 'admin@test.dev', password: 'Sup3rSecret!' })
    );
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/en/admin'));
  });

  it('shows a generic error on a failed login, without revealing the cause', async () => {
    adminLogin.mutateAsync.mockRejectedValue(new Error('wrong password'));
    Object.assign(adminLogin, { isError: true });
    const user = userEvent.setup();
    render(<AdminLoginForm locale="en" />);

    await user.type(screen.getByLabelText('Email or phone'), 'admin@test.dev');
    await user.type(screen.getByLabelText('Password'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid credentials.')).toBeInTheDocument();
    expect(screen.queryByText(/wrong password/i)).not.toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('redirects away immediately if already signed in as an admin/staff', () => {
    auth.isAdmin = true;
    render(<AdminLoginForm locale="en" />);
    expect(routerReplace).toHaveBeenCalledWith('/en/admin');
  });

  it('links to the forgot-password flow', () => {
    render(<AdminLoginForm locale="en" />);
    expect(screen.getByRole('link', { name: /Forgot your password/i })).toHaveAttribute(
      'href',
      '/en/forgot-password'
    );
  });
});
