import argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { recordAudit } from '../../lib/audit';
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

// ---------------------------------------------------------------------------
// Delegation guardrails
//
// The whole /roles + /team subtree is reachable by any STAFF whose custom role
// carries `roles:manage` — that delegation is an intended feature. Without the
// checks below, though, that STAFF could mint themselves a full ADMIN, author a
// role holding permissions they don't have and self-assign it, or strip a real
// ADMIN's permissions. So, for a NON-ADMIN caller:
//   1. they may never touch the ADMIN tier — create an ADMIN, promote/demote
//      anyone to/from ADMIN, or modify an existing ADMIN account;
//   2. they may never change their own role;
//   3. they may only grant / assign permission keys they themselves hold
//      (a "you can't give what you don't have" ceiling).
// An ADMIN caller bypasses all three.
// ---------------------------------------------------------------------------

export interface RbacActor {
  id: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  /** The caller's own effective permission set (from requirePermission). */
  permissions: Set<string>;
}

const isAdmin = (a: RbacActor) => a.role === 'ADMIN';

/** Permission keys the actor is trying to grant but does not hold themselves. */
function permissionsBeyond(actor: RbacActor, requested: Iterable<string>): string[] {
  if (isAdmin(actor)) return [];
  return [...expandImplied(requested)].filter((k) => !actor.permissions.has(k)).sort();
}

/** Throws unless every requested key is within the actor's own held set. */
function assertCanGrant(actor: RbacActor, requested: Iterable<string>) {
  const beyond = permissionsBeyond(actor, requested);
  if (beyond.length > 0) {
    throw new AppError(
      'FORBIDDEN',
      `You can only grant permissions you hold yourself. Not yours: ${beyond.join(', ')}`
    );
  }
}

/** A non-ADMIN caller may not act on an ADMIN account at all. */
function assertMayTarget(actor: RbacActor, target: { role: string }) {
  if (!isAdmin(actor) && target.role === 'ADMIN') {
    throw new AppError('FORBIDDEN', 'Only an admin can modify an admin account.');
  }
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

export async function createRole(actor: RbacActor, input: CreateRoleInput) {
  assertCanGrant(actor, input.permissions);
  try {
    const role = await prisma.role.create({
      data: {
        name: input.name,
        description: input.description || null,
        permissions: normalise(input.permissions),
      },
    });
    await recordAudit({
      entityType: 'role',
      entityID: role.id,
      action: 'role.created',
      actorID: actor.id,
      metadata: { name: role.name, permissions: role.permissions },
    });
    return role;
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateRole(actor: RbacActor, id: string, input: UpdateRoleInput) {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Role not found');
  // A ceiling'd caller can neither add permissions beyond their own nor edit a
  // role that already holds any — otherwise they could rename / repurpose a
  // powerful role they can't see the full weight of.
  if (!isAdmin(actor)) {
    if (input.permissions !== undefined) assertCanGrant(actor, input.permissions);
    const existingBeyond = permissionsBeyond(actor, existing.permissions);
    if (existingBeyond.length > 0) {
      throw new AppError(
        'FORBIDDEN',
        'This role includes permissions you don’t hold — only an admin can edit it.'
      );
    }
  }
  try {
    const role = await prisma.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.permissions !== undefined ? { permissions: normalise(input.permissions) } : {}),
      },
    });
    await recordAudit({
      entityType: 'role',
      entityID: role.id,
      action: 'role.updated',
      actorID: actor.id,
      metadata: { name: role.name, before: existing.permissions, after: role.permissions },
    });
    return role;
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function deleteRole(actor: RbacActor, id: string) {
  const existing = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Role not found');
  if (existing.isSystem) throw new AppError('CONFLICT', 'Built-in roles cannot be deleted.');
  if (existing._count.users > 0) {
    throw new AppError('CONFLICT', 'Unassign this role from all users before deleting it.');
  }
  if (!isAdmin(actor) && permissionsBeyond(actor, existing.permissions).length > 0) {
    throw new AppError(
      'FORBIDDEN',
      'This role includes permissions you don’t hold — only an admin can delete it.'
    );
  }
  await prisma.role.delete({ where: { id } });
  await recordAudit({
    entityType: 'role',
    entityID: id,
    action: 'role.deleted',
    actorID: actor.id,
    metadata: { name: existing.name, permissions: existing.permissions },
  });
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

export async function assignRole(actor: RbacActor, userId: string, roleId: string | null) {
  const user = await loadStaffUser(userId);
  assertMayTarget(actor, user);
  if (user.role === 'ADMIN' && roleId) {
    throw new AppError('VALIDATION_ERROR', 'Admins already hold every permission — assign a role to STAFF users instead.');
  }
  if (roleId) {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, permissions: true },
    });
    if (!role) throw new AppError('NOT_FOUND', 'Role not found');
    // Can't hand someone a role more powerful than you are.
    assertCanGrant(actor, role.permissions);
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { customRoleID: roleId },
    select: teamSelect,
  });
  await recordAudit({
    entityType: 'user',
    entityID: userId,
    action: 'team.role_assigned',
    actorID: actor.id,
    metadata: { roleId },
  });
  return withEffective(updated);
}

export async function setRevoked(actor: RbacActor, userId: string, revoked: string[]) {
  const user = await loadStaffUser(userId);
  assertMayTarget(actor, user);
  const next = [...new Set(revoked)].sort();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { revokedPermissions: next },
    select: teamSelect,
  });
  await recordAudit({
    entityType: 'user',
    entityID: userId,
    action: 'team.permissions_revoked',
    actorID: actor.id,
    metadata: { revoked: next },
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
export async function createTeamMember(actor: RbacActor, input: CreateTeamMemberInput) {
  if (input.role === 'ADMIN' && !isAdmin(actor)) {
    throw new AppError('FORBIDDEN', 'Only an admin can create an admin account.');
  }
  if (input.role === 'ADMIN' && input.roleId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Admins already hold every permission — assign a role to STAFF members instead.'
    );
  }
  if (input.roleId) {
    const role = await prisma.role.findUnique({
      where: { id: input.roleId },
      select: { id: true, permissions: true },
    });
    if (!role) throw new AppError('NOT_FOUND', 'Role not found');
    assertCanGrant(actor, role.permissions);
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
    await recordAudit({
      entityType: 'user',
      entityID: created.id,
      action: 'team.member_created',
      actorID: actor.id,
      metadata: { email: created.email, role: created.role, roleId: input.roleId ?? null },
    });
    return withEffective(created);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('CONFLICT', 'An account with this email already exists.');
    }
    throw e as Error;
  }
}

/** Toggle a member's active flag and/or move them between STAFF and ADMIN.
 *  Only an ADMIN may change anyone's role or touch another ADMIN's account, and
 *  nobody may change their own role or lock themselves out here. */
export async function updateTeamMember(
  userId: string,
  input: UpdateTeamMemberInput,
  actor: RbacActor
) {
  const target = await loadStaffUser(userId);
  assertMayTarget(actor, target);
  if (input.role !== undefined && !isAdmin(actor)) {
    throw new AppError('FORBIDDEN', 'Only an admin can change a member’s role.');
  }
  if (userId === actor.id && (input.isActive === false || input.role !== undefined)) {
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
  await recordAudit({
    entityType: 'user',
    entityID: userId,
    action: 'team.member_updated',
    actorID: actor.id,
    metadata: {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return withEffective(updated);
}

function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError('CONFLICT', 'A role with this name already exists.');
  }
  return e as Error;
}
