import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { AccountView } from './account-view';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const auth = { status: 'authenticated' as 'authenticated' | 'loading' | 'guest' };
const profile = {
  data: { id: 'u1', name: 'Ali', email: 'ali@test.dev', phone: '0790000000', emailVerified: '2026-01-01', role: 'CUSTOMER', isActive: true, dateCreated: 'x' },
  isPending: false,
};
const updateProfile = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false, error: null as unknown };
const addresses = {
  data: [
    { id: 'a1', userID: 'u1', fullName: 'Ali', phone: '0790000000', addressLine: '12 Rainbow St', city: 'Amman', area: null, notes: null, isDefault: true },
  ],
  isPending: false,
};
const createAddress = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false };
const updateAddress = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false };
const deleteAddress = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-account', () => ({
  useProfile: () => profile,
  useUpdateProfile: () => updateProfile,
  useAddresses: () => addresses,
  useCreateAddress: () => createAddress,
  useUpdateAddress: () => updateAddress,
  useDeleteAddress: () => deleteAddress,
}));

const renderView = () => {
  const { Wrapper } = createWrapper();
  return render(<AccountView locale="en" />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.status = 'authenticated';
  Object.assign(updateProfile, { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false });
  Object.assign(createAddress, { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false });
  Object.assign(deleteAddress, { mutate: vi.fn(), isPending: false });
});

describe('<AccountView>', () => {
  it('when not signed in: prompts to sign in with a next= back to the account page', () => {
    auth.status = 'guest';
    renderView();
    expect(screen.getByText(/Please sign in/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/en/login?next=/en/account');
  });

  it('shows the profile (email + verified badge) and the saved addresses', () => {
    renderView();
    expect(screen.getByText('ali@test.dev')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText(/12 Rainbow St, Amman/)).toBeInTheDocument();
  });

  it('saves a profile edit', async () => {
    const user = userEvent.setup();
    renderView();
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Ali Updated');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ name: 'Ali Updated', phone: '0790000000' });
  });

  it('adds a new address', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Add an address' }));

    await user.type(screen.getByLabelText('Recipient name'), 'Sara');
    await user.type(screen.getByLabelText('Contact phone'), '0791111111');
    await user.type(screen.getByLabelText('Street address'), '5 Cedar Ave');
    await user.type(screen.getByLabelText('City'), 'Zarqa');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(createAddress.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Sara', city: 'Zarqa', addressLine: '5 Cedar Ave' })
      )
    );
  });

  it('deletes an address', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteAddress.mutate).toHaveBeenCalledWith('a1');
  });
});
