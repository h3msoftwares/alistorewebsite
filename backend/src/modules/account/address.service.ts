import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { z } from 'zod';
import { createAddressSchema, updateAddressSchema } from './address.schema';

type CreateAddressInput = z.infer<typeof createAddressSchema>;
type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export function listAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userID: userId },
    orderBy: [{ isDefault: 'desc' }, { dateCreated: 'desc' }],
  });
}

export async function getAddress(userId: string, id: string) {
  const address = await prisma.address.findFirst({ where: { id, userID: userId } });
  if (!address) throw new AppError('NOT_FOUND', 'Address not found');
  return address;
}

export async function createAddress(userId: string, input: CreateAddressInput) {
  return prisma.$transaction(async (tx) => {
    // First address is always default; an explicit isDefault clears the others.
    const count = await tx.address.count({ where: { userID: userId } });
    const isDefault = input.isDefault || count === 0;
    if (isDefault) {
      await tx.address.updateMany({ where: { userID: userId }, data: { isDefault: false } });
    }
    // The recipient defaults to the account holder — the storefront no longer
    // asks for it separately (matches registration).
    const fullName =
      input.fullName ??
      (await tx.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ??
      'Account holder';
    return tx.address.create({ data: { ...input, fullName, isDefault, userID: userId } });
  });
}

export async function updateAddress(userId: string, id: string, input: UpdateAddressInput) {
  await getAddress(userId, id);
  return prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.address.updateMany({ where: { userID: userId }, data: { isDefault: false } });
    }
    return tx.address.update({ where: { id }, data: input });
  });
}

export async function deleteAddress(userId: string, id: string) {
  const address = await getAddress(userId, id);
  await prisma.address.delete({ where: { id } });

  // If we removed the default, promote the most recent remaining address.
  if (address.isDefault) {
    const next = await prisma.address.findFirst({
      where: { userID: userId },
      orderBy: { dateCreated: 'desc' },
    });
    if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}
