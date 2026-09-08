import argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { PERMISSION_AREAS, effectivePermissions, expandImplied } from '../../lib/permissions';
import type {
  CreateRoleInput,
  UpdateRoleInput,
  CreateTeamMemberInput,
  UpdateTeamMemberInput,
} from './role.schema';

export function permissionCatalog() {
  return { areas: PERMISSION_AREAS };
}

// ---- Roles ----

export function listRoles() {
  return prisma.role.findMany({
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { users: true } } },
  });
}

// `manage` without its `view` sibling is nonsensical in the UI — normalise so
// what's stored always expands cleanly.
function normalise(keys: string[]): string[] {
  return [...expandImplied(keys)].sort();
}

export async function createRole(input: CreateRoleInput) {
  try {
    return await prisma.role.create({
      data: {
        name: input.name,
        description: input.description || null,
        permissions: normalise(input.permissions),
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateRole(id: string, input: UpdateRoleInput) {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Role not found');
  try {
    return await prisma.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.permissions !== undefined ? { permissions: normalise(input.permissions) } : {}),
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function deleteRole(id: string) {
  const existing = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Role not found');
  if (existing.isSystem) throw new AppError('CONFLICT', 'Built-in roles cannot be deleted.');
  if (existing._count.users > 0) {
    throw new AppError('CONFLICT', 'Unassign this role from all users before deleting it.');
  }
  await prisma.role.delete({ where: { id } });
}

// ---- Team (STAFF / ADMIN users) ----

const teamSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  revokedPermissions: true,
  customRole: { select: { id: true, name: true, permissions: true } },
} satisfies Prisma.UserSelect;

type TeamUser = Prisma.UserGetPayload<{ select: typeof teamSelect }>;

function withEffective(u: TeamUser) {
  return {
    ...u,
    effectivePermissions: [
      ...effectivePermissions({
        role: u.role,
        rolePermissions: u.customRole?.permissions ?? null,
        revoked: u.revokedPermissions,
      }),
    ].sort(),
  };
}

export async function listTeam() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN'] }, deletedAt: null },
    orderBy: [{ role: 'desc' }, { name: 'asc' }],
    select: teamSelect,
  });
  return users.map(withEffective);
}

async function loadStaffUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: teamSelect });
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
    throw new AppError('VALIDATION_ERROR', 'That user is not a staff or admin account.');
  }
  return user;
}

export async function assignRole(userId: string, roleId: string | null) {
  const user = await loadStaffUser(userId);
  if (user.role === 'ADMIN' && roleId) {
    throw new AppError('VALIDATION_ERROR', 'Admins already hold every permission — assign a role to STAFF users instead.');
  }
  if (roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) throw new AppError('NOT_FOUND', 'Role not found');
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { customRoleID: roleId },
    select: teamSelect,
  });
  return withEffective(updated);
}

export async function setRevoked(userId: string, revoked: string[]) {
  await loadStaffUser(userId);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { revokedPermissions: [...new Set(revoked)].sort() },
    select: teamSelect,
  });
  return withEffective(updated);
}

/**
 * Create a STAFF/ADMIN account. Admin-created, so the email is trusted and
 * marked verified straight away — the admin door (admin-auth.service.ts) never
 * checks `emailVerified`, only `isActive` + `passwordHash` + role. The new
 * member signs in at /ali-admin-login with this password and can change it from
 * their account page.
 */
export async function createTeamMember(input: CreateTeamMemberInput) {
  if (input.role === 'ADMIN' && input.roleId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Admins already hold every permission — assign a role to STAFF members instead.'
    );
  }
  if (input.roleId) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true } });
    if (!role) throw new AppError('NOT_FOUND', 'Role not found');
  }
  const passwordHash = await argon2.hash(input.password);
  try {
    const created = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        emailVerified: new Date(),
        customRoleID: input.role === 'STAFF' ? input.roleId ?? null : null,
      },
      select: teamSelect,
    });
    return withEffective(created);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('CONFLICT', 'An account with this email already exists.');
    }
    throw e as Error;
  }
}

/** Toggle a member's active flag and/or move them between STAFF and ADMIN. An
 *  admin can't lock themselves out or drop their own ADMIN role here. */
export async function updateTeamMember(
  userId: string,
  input: UpdateTeamMemberInput,
  actingUserId: string
) {
  await loadStaffUser(userId);
  if (userId === actingUserId && (input.isActive === false || input.role === 'STAFF')) {
    throw new AppError('VALIDATION_ERROR', 'You can’t change your own access here.');
  }
  const data: Prisma.UserUncheckedUpdateInput = {};
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.role !== undefined) {
    data.role = input.role;
    // ADMIN holds everything — a custom role assignment would be meaningless.
    if (input.role === 'ADMIN') data.customRoleID = null;
  }
  const updated = await prisma.user.update({ where: { id: userId }, data, select: teamSelect });
  return withEffective(updated);
}

function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError('CONFLICT', 'A role with this name already exists.');
  }
  return e as Error;
}
