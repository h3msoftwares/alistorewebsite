import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import type { AuthUser, PermissionArea, Role, TeamMember } from '@/lib/types';

const navigation = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: navigation.locale }) }));

const catalog: PermissionArea[] = [
  { area: 'orders', label: 'Orders', levels: ['view', 'manage'] },
  { area: 'refunds', label: 'Refund marking', levels: ['view', 'manage'] },
];

const role: Role = {
  id: 'role1',
  name: 'Support',
  description: 'Handles orders',
  permissions: ['orders:view'],
  isSystem: false,
  dateCreated: '2026-01-01T00:00:00.000Z',
  _count: { users: 0 },
};

const member: TeamMember = {
  id: 'user1',
  name: 'Sam Staff',
  email: 'sam@test.dev',
  role: 'STAFF',
  isActive: true,
  revokedPermissions: [],
  customRole: null,
  effectivePermissions: ['orders:view'],
};

const catalogQuery = { data: catalog, isPending: false };
const rolesQuery: { data: Role[]; isPending: boolean; isError: boolean } = { data: [role], isPending: false, isError: false };
const teamQuery: { data: TeamMember[]; isPending: boolean; isError: boolean } = { data: [member], isPending: false, isError: false };

const createRole = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const updateRole = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const deleteRole = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const createMember = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const updateMember = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const deleteMember = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const assignRole = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const setRevoked = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };

vi.mock('@/hooks/use-rbac', () => ({
  usePermissionCatalog: () => catalogQuery,
  useRoles: () => rolesQuery,
  useTeam: () => teamQuery,
  useCreateRole: () => createRole,
  useUpdateRole: () => updateRole,
  useDeleteRole: () => deleteRole,
  useCreateTeamMember: () => createMember,
  useUpdateTeamMember: () => updateMember,
  useDeleteTeamMember: () => deleteMember,
  useAssignRole: () => assignRole,
  useSetRevoked: () => setRevoked,
}));

import AdminRolesPage from './page';

function renderPage() {
  const { Wrapper, store } = createWrapper();
  store.dispatch({
    type: 'auth/authenticated',
    payload: {
      id: 'admin1',
      name: 'Boss',
      email: 'boss@test.dev',
      phone: null,
      role: 'ADMIN',
      permissions: ['roles:view', 'roles:manage'],
    } satisfies AuthUser,
  });
  return render(<AdminRolesPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  navigation.locale = 'en';
  vi.clearAllMocks();
  Object.assign(rolesQuery, { data: [role], isPending: false, isError: false });
  Object.assign(teamQuery, { data: [member], isPending: false, isError: false });
});

describe('AdminRolesPage — Roles tab', () => {
  it.each(['en', 'ar'])('marks refunds:view reserved without a selectable checkbox in %s', async locale => {
    navigation.locale = locale;
    const user = userEvent.setup(); renderPage();
    await user.click(screen.getByRole('button', { name: locale === 'en' ? 'New role' : 'دور جديد' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.queryByRole('checkbox', { name: locale === 'en' ? 'Refund marking — view' : 'تسجيل استرداد الأموال — عرض' })).not.toBeInTheDocument();
    expect(dialog.getByText(locale === 'en' ? 'Reserved' : 'محجوزة')).toHaveAttribute('title',
      locale === 'en' ? 'No separate read-only access exists yet.' : 'لا يوجد وصول مستقل للعرض حاليًا.');
    expect(dialog.getByRole('checkbox', { name: locale === 'en' ? 'Refund marking — manage' : 'تسجيل استرداد الأموال — إدارة' })).toBeEnabled();
  });

  it('preserves an existing reserved key when editing a role', async () => {
    rolesQuery.data = [{ ...role, permissions: ['orders:view', 'refunds:view'] }];
    const user = userEvent.setup(); renderPage();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    expect(updateRole.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ permissions: ['orders:view', 'refunds:view'] }),
    }));
  });

  it('lists roles without a permanently open form', () => {
    renderPage();
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a dialog to create a role and submits it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New role' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Reviewer');
    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));

    expect(createRole.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Reviewer', permissions: [] })
    );
  });

  it('opens a dialog pre-filled to edit a role and submits it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('Support')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(updateRole.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'role1', body: expect.objectContaining({ name: 'Support' }) })
    );
  });
});

describe('AdminRolesPage — Team tab', () => {
  it('opens a dialog to add a team member instead of an always-open form', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Team' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Sam Staff')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add team member' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'New Hire');
    await user.type(within(dialog).getByLabelText(/^Email/), 'new@test.dev');
    await user.type(within(dialog).getByLabelText(/Temporary password/), 'password123');
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));

    expect(createMember.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Hire', email: 'new@test.dev' })
    );
  });

  it('deletes a team member after confirming, and not before', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Team' }));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteMember.mutateAsync).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(deleteMember.mutateAsync).toHaveBeenCalledWith('user1');
  });
});
