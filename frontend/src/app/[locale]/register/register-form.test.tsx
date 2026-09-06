import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { ApiError } from '@/lib/api';
import { RegisterForm } from './register-form';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const registerMut = { mutateAsync: vi.fn(), isPending: false };
const resend = { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false };
vi.mock('@/hooks/use-auth', () => ({
  useRegister: () => registerMut,
  useResendVerification: () => resend,
}));

const renderForm = (locale: 'en' | 'ar' = 'en') => {
  const { Wrapper } = createWrapper();
  return render(<RegisterForm locale={locale} />, { wrapper: Wrapper });
};

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Ali Tester');
  await user.type(screen.getByLabelText('Email'), 'ali@test.dev');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.type(screen.getByLabelText('Contact phone'), '0791234567');
  await user.type(screen.getByLabelText('Street address'), '12 Rainbow Street');
  await user.type(screen.getByLabelText('City'), 'Amman');
  await user.selectOptions(screen.getByLabelText('Governorate'), 'MOUNT_LEBANON');
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(registerMut, { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false });
  Object.assign(resend, { mutateAsync: vi.fn().mockResolvedValue({ message: 'ok' }), isPending: false });
});

describe('<RegisterForm>', () => {
  it('renders the account + address sections and a link to sign in', () => {
    renderForm();
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Delivery address')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/en/login');
  });

  it('does not submit an incomplete form (address required)', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Email'), 'ali@test.dev');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(registerMut.mutateAsync).not.toHaveBeenCalled();
  });

  it('has no top-level phone or recipient-name field', () => {
    renderForm();
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Recipient name')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Contact phone')).toBeInTheDocument();
  });

  it('submits the payload (with locale) and shows the "check your email" state — no session', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(registerMut.mutateAsync).toHaveBeenCalledWith({
      email: 'ali@test.dev',
      password: 'password123',
      name: 'Ali Tester',
      address: {
        phone: '0791234567',
        addressLine: '12 Rainbow Street',
        city: 'Amman',
        region: 'MOUNT_LEBANON',
        area: '',
        notes: '',
      },
      locale: 'en',
    });

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    expect(screen.getByText(/verification link to ali@test.dev/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/en/login');
  });

  it('a 429 keeps the form and shows a rate-limit notice', async () => {
    const user = userEvent.setup();
    registerMut.mutateAsync = vi
      .fn()
      .mockRejectedValue(new ApiError(429, { code: 'RATE_LIMITED', message: 'slow down' }));
    renderForm();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/Too many attempts/i)).toBeInTheDocument();
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('the success panel can resend the verification email', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Check your email');

    await user.click(screen.getByRole('button', { name: /Resend/i }));
    expect(resend.mutateAsync).toHaveBeenCalledWith({ email: 'ali@test.dev', locale: 'en' });
  });
});
