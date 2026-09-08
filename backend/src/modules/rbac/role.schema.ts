import { z } from 'zod';
import { isValidPermission } from '../../lib/permissions';

const permissionKey = z.string().refine(isValidPermission, { message: 'unknown permission key' });
const permissionList = z.array(permissionKey).max(64);

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).or(z.literal('')).nullish(),
  permissions: permissionList.default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(200).or(z.literal('')).nullish(),
  permissions: permissionList.optional(),
});

export const roleIdParamSchema = z.object({ id: z.string().uuid() });

export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  // null clears the assignment.
  roleId: z.string().uuid().nullable(),
});

export const setRevokedSchema = z.object({
  userId: z.string().uuid(),
  revoked: permissionList,
});

export const teamMemberIdParamSchema = z.object({ id: z.string().uuid() });

// Admin-created team account. Email is lower-cased for the same reason as
// registration (auth.schema.ts); password caps match the login schemas.
export const createTeamMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(320).toLowerCase(),
  password: z.string().min(8).max(200),
  role: z.enum(['STAFF', 'ADMIN']).default('STAFF'),
  // Custom role to attach on creation — STAFF only; ignored for ADMIN.
  roleId: z.string().uuid().nullish(),
});

export const updateTeamMemberSchema = z
  .object({
    role: z.enum(['STAFF', 'ADMIN']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, {
    message: 'Nothing to update',
  });

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type CreateTeamMemberInput = z.infer<typeof createTeamMemberSchema>;
export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
