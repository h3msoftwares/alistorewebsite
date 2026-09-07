import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { AccountView } from './account-view';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const routerReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: routerReplace }) }));
const logout = { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false };
const changePassword = {
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
  isError: false,
  error: null as unknown,
};

const auth = { status: 'authenticated' as 'authenticated' | 'loading' | 'guest' };
const profile = {
  data: { id: 'u1', name: 'Ali', email: 'ali@test.dev', phone: '0790000000', emailVerified: '2026-01-01', role: 'CUSTOMER', isActive: true, dateCreated: 'x' },
  isPending: false,
};
const updateProfile = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false, error: null as unknown };
const addresses = {
  data: [
    { id: 'a1', userID: 'u1', fullName: 'Ali', phone: '0790000000', addressLine: '12 Rainbow St', city: 'Amman', region: 'MOUNT_LEBANON', area: null, notes: null, isDefault: true },
  ],
  isPending: false,
};
const createAddress = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false };
const updateAddress = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false };
const deleteAddress = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => auth,
  useLogout: () => logout,
  useChangePassword: () => changePassword,
}));
vi.mock('@/hooks/use-account', () => ({
  useProfile: () => profile,
  useUpdateProfile: () => updateProfile,
  useAddresses: () => addresses,
  useCreateAddress: () => createAddress,
  useUpdateAddress: () => updateAddress,
  useDeleteAddress: () => deleteAddress,
}));
vi.mock('@/lib/use-delivery-region-options', async () => {
  const { DELIVERY_REGIONS } = await vi.importActual<typeof import('@/lib/regions')>('@/lib/regions');
  return {
    useDeliveryRegionOptions: () => DELIVERY_REGIONS.map((r) => ({ value: r.value, label: r.en })),
  };
});

const renderView = () => {
  const { Wrapper } = createWrapper();
  return render(<AccountView locale="en" />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.status = 'authenticated';
  Object.assign(logout, { mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false });
  Object.assign(changePassword, {
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    isError: false,
    error: null,
  });
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
    expect(screen.getByText(/Mount Lebanon ·/)).toBeInTheDocument();
  });

  it('prefills the governorate when editing a saved address', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Governorate')).toHaveValue('MOUNT_LEBANON');
  });

  it('saves a profile edit (name only — no phone field)', async () => {
    const user = userEvent.setup();
    renderView();
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument();
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Ali Updated');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ name: 'Ali Updated' });
  });

  it('adds a new address (no recipient-name field — it defaults to the account holder)', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Add an address' }));

    expect(screen.queryByLabelText('Recipient name')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Contact phone'), '0791111111');
    await user.type(screen.getByLabelText('Street address'), '5 Cedar Ave');
    await user.type(screen.getByLabelText('City'), 'Zarqa');
    await user.selectOptions(screen.getByLabelText('Governorate'), 'BEIRUT');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(createAddress.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Zarqa',
          addressLine: '5 Cedar Ave',
          phone: '0791111111',
          region: 'BEIRUT',
        })
      )
    );
    expect(createAddress.mutateAsync.mock.calls[0][0]).not.toHaveProperty('fullName');
  });

  it('changes the password: sends current + new, not the confirm field', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText('Current password'), 'OldPass123!');
    await user.type(screen.getByLabelText('New password'), 'NewPass456!');
    await user.type(screen.getByLabelText('Confirm new password'), 'NewPass456!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(changePassword.mutateAsync).toHaveBeenCalledWith({
        currentPassword: 'OldPass123!',
        newPassword: 'NewPass456!',
      })
    );
  });

  it('blocks the password change when the confirmation does not match', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText('Current password'), 'OldPass123!');
    await user.type(screen.getByLabelText('New password'), 'NewPass456!');
    await user.type(screen.getByLabelText('Confirm new password'), 'different!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(changePassword.mutateAsync).not.toHaveBeenCalled();
  });

  it('links to the forgot-password flow, tagged so the reset returns to /account', () => {
    renderView();
    expect(screen.getByRole('link', { name: /Forgot your current password/i })).toHaveAttribute(
      'href',
      '/en/forgot-password?return=account'
    );
  });

  it('deletes an address', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteAddress.mutate).toHaveBeenCalledWith('a1');
  });

  it('has a log-out control that signs the user out and sends them home', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logout.mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/en'));
  });
});
