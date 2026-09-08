import { api } from './client';
import type {
  NewTeamMember,
  PermissionArea,
  Role,
  RoleBody,
  TeamMember,
  UUID,
} from '../types';

// All under /api/admin — the subtree is gated by requireRole('STAFF','ADMIN')
// and then per-route by requirePermission('roles:view' | 'roles:manage').

// ---- Permission catalog (drives the roles-page matrix) ----

export function getPermissionCatalog() {
  return api.get<{ areas: PermissionArea[] }>('/api/admin/permissions').then((r) => r.areas);
}

// ---- Roles CRUD ----

export function listRoles() {
  return api.get<{ roles: Role[] }>('/api/admin/roles').then((r) => r.roles);
}

export function createRole(body: RoleBody) {
  return api.post<{ role: Role }>('/api/admin/roles', body).then((r) => r.role);
}

export function updateRole(id: UUID, body: Partial<RoleBody>) {
  return api.patch<{ role: Role }>(`/api/admin/roles/${id}`, body).then((r) => r.role);
}

export function deleteRole(id: UUID) {
  return api.del(`/api/admin/roles/${id}`);
}

// ---- Team (STAFF / ADMIN accounts) ----

export function listTeam() {
  return api.get<{ team: TeamMember[] }>('/api/admin/team').then((r) => r.team);
}

/** Create a STAFF/ADMIN account. They sign in at /ali-admin-login. */
export function createTeamMember(body: NewTeamMember) {
  return api.post<{ user: TeamMember }>('/api/admin/team', body).then((r) => r.user);
}

/** Toggle a member's active flag or move them between STAFF and ADMIN. */
export function updateTeamMember(
  id: UUID,
  body: { role?: 'STAFF' | 'ADMIN'; isActive?: boolean }
) {
  return api.patch<{ user: TeamMember }>(`/api/admin/team/${id}`, body).then((r) => r.user);
}

/** Assign a custom role to a STAFF user, or pass `null` to clear it. */
export function assignRole(userId: UUID, roleId: UUID | null) {
  return api.post<{ user: TeamMember }>('/api/admin/team/assign-role', { userId, roleId }).then((r) => r.user);
}

/** Replace a user's revoked-permission list (used to trim an ADMIN's implicit
 *  all-permissions). */
export function setRevoked(userId: UUID, revoked: string[]) {
  return api.post<{ user: TeamMember }>('/api/admin/team/revoke', { userId, revoked }).then((r) => r.user);
}
