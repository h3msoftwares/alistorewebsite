import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
}));

const changePassword = {
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
  isError: false,
  error: null as unknown,
};
const requestEmailChange = {
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null as unknown,
};
// Defaults to STAFF so the password-change tests below don't collide with a
// second "Current password" field from the ADMIN-only EmailSection — see the
// dedicated "email-change form" tests for the ADMIN-only assertions.
const auth: { user: { id: string; name: string; role: 'ADMIN' | 'STAFF' } } = {
  user: { id: 'staff1', name: 'Boss', role: 'STAFF' },
};

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => auth,
  useChangePassword: () => changePassword,
  useRequestEmailChange: () => requestEmailChange,
}));

const profile = {
  data: {
    id: 'staff1',
    name: 'Boss',
    email: 'boss@test.dev',
    phone: '0790000000',
    emailVerified: '2026-01-01',
    role: 'STAFF',
    isActive: true,
    dateCreated: 'x',
  },
  isPending: false,
};
const updateProfile = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false, isError: false, error: null as unknown };

vi.mock('@/hooks/use-account', () => ({
  useProfile: () => profile,
  useUpdateProfile: () => updateProfile,
}));

import AdminProfilePage from './page';

function renderPage() {
  const { Wrapper } = createWrapper();
  return render(<AdminProfilePage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { id: 'staff1', name: 'Boss', role: 'STAFF' };
  Object.assign(profile, {
    data: { ...profile.data, name: 'Boss', phone: '0790000000', role: 'STAFF' },
    isPending: false,
  });
  Object.assign(changePassword, { isPending: false, isError: false, error: null });
  Object.assign(requestEmailChange, { isPending: false, isError: false, isSuccess: false, error: null });
});

describe('AdminProfilePage', () => {
  it('shows the profile form prefilled with the current name and phone', () => {
    renderPage();
    expect(screen.getByLabelText('Name')).toHaveValue('Boss');
    expect(screen.getByLabelText('Phone')).toHaveValue('0790000000');
  });

  it('saves a profile edit (name and phone, unlike the storefront /account page which only edits name)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'New Name');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(updateProfile.mutateAsync).toHaveBeenCalledWith({ name: 'New Name', phone: '0790000000' })
    );
  });

  it('changes the password for a STAFF user: sends current + new, not the confirm field', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPassw0rd!');
    await user.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    await user.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() =>
      expect(changePassword.mutateAsync).toHaveBeenCalledWith({
        currentPassword: 'OldPassw0rd!',
        newPassword: 'NewPassw0rd!',
      })
    );
  });

  it('blocks the password change when the confirmation does not match', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Current password'), 'OldPassw0rd!');
    await user.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    await user.type(screen.getByLabelText('Confirm new password'), 'Different!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(changePassword.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows the email-change form for an ADMIN', () => {
    auth.user = { id: 'admin1', name: 'Boss', role: 'ADMIN' };
    renderPage();
    expect(screen.getByRole('button', { name: 'Send confirmation link' })).toBeInTheDocument();
  });

  // isAdmin (selectIsAdmin) is true for STAFF too, but the backend route is
  // ADMIN-only (email-change.routes.ts requireRole('ADMIN')) — this page must
  // gate on the exact role, not the broader flag, same fix as account-view.tsx.
  it('hides the email-change form for STAFF', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Send confirmation link' })).not.toBeInTheDocument();
  });
});
