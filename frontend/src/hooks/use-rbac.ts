'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountApi, rbacApi } from '@/lib/api';
import { useAppDispatch } from '@/store/hooks';
import { authenticated } from '@/store/slices/authSlice';
import type { NewTeamMember, RoleBody, UUID } from '@/lib/types';

const CATALOG_KEY = ['rbac', 'permissions'] as const;
const ROLES_KEY = ['rbac', 'roles'] as const;
const TEAM_KEY = ['rbac', 'team'] as const;

// ---- Permission catalog ----

export function usePermissionCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: rbacApi.getPermissionCatalog,
    staleTime: 5 * 60_000, // it's effectively static
  });
}

// ---- Roles ----

export function useRoles() {
  return useQuery({ queryKey: ROLES_KEY, queryFn: rbacApi.listRoles });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RoleBody) => rbacApi.createRole(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROLES_KEY }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  const refreshProfile = useRefreshProfile();
  return useMutation({
    mutationFn: ({ id, body }: { id: UUID; body: Partial<RoleBody> }) =>
      rbacApi.updateRole(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROLES_KEY });
      qc.invalidateQueries({ queryKey: TEAM_KEY });
      // The signed-in user may hold the role that just changed.
      refreshProfile();
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: UUID) => rbacApi.deleteRole(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROLES_KEY });
      qc.invalidateQueries({ queryKey: TEAM_KEY });
    },
  });
}

// ---- Team ----

export function useTeam() {
  return useQuery({ queryKey: TEAM_KEY, queryFn: rbacApi.listTeam });
}

export function useCreateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewTeamMember) => rbacApi.createTeamMember(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEAM_KEY }),
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  const refreshProfile = useRefreshProfile();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: UUID;
      body: { role?: 'STAFF' | 'ADMIN'; isActive?: boolean };
    }) => rbacApi.updateTeamMember(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEAM_KEY });
      refreshProfile();
    },
  });
}

export function useAssignRole() {
  const qc = useQueryClient();
  const refreshProfile = useRefreshProfile();
  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: UUID; roleId: UUID | null }) =>
      rbacApi.assignRole(userId, roleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEAM_KEY });
      refreshProfile();
    },
  });
}

export function useSetRevoked() {
  const qc = useQueryClient();
  const refreshProfile = useRefreshProfile();
  return useMutation({
    mutationFn: ({ userId, revoked }: { userId: UUID; revoked: string[] }) =>
      rbacApi.setRevoked(userId, revoked),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TEAM_KEY });
      refreshProfile();
    },
  });
}

/** Re-pull the signed-in profile into Redux so a permission change that touches
 *  the current user takes effect without a reload. Best-effort. */
function useRefreshProfile() {
  const dispatch = useAppDispatch();
  return () => {
    accountApi
      .getProfile()
      .then((profile) => dispatch(authenticated(profile)))
      .catch(() => {});
  };
}
