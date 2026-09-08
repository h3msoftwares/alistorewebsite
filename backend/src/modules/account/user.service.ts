import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { effectivePermissions } from '../../lib/permissions';
import { z } from 'zod';
import { updateProfileSchema } from './user.schema';

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

const publicSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  phone: true,
  role: true,
  isActive: true,
  dateCreated: true,
} satisfies Prisma.UserSelect;

/** getProfile also resolves the caller's effective admin permissions + role
 *  name so the admin UI can gate pages/nav without a second request. */
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicSelect, revokedPermissions: true, customRole: { select: { name: true, permissions: true } } },
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const { revokedPermissions, customRole, ...rest } = user;
  return {
    ...rest,
    roleName: customRole?.name ?? null,
    permissions: [
      ...effectivePermissions({
        role: user.role,
        rolePermissions: customRole?.permissions ?? null,
        revoked: revokedPermissions,
      }),
    ].sort(),
  };
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
      },
      select: publicSelect,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('CONFLICT', 'That phone number is already in use');
    }
    throw e;
  }
}
