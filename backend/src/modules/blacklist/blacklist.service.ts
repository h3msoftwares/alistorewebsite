import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import type { BlacklistType } from '@prisma/client';

// Emails are matched case-insensitively (accounts are stored lower-cased
// too); phone/IP are matched as-is — an admin enters them exactly as they
// appear on the order they're blocking.
function normalize(type: BlacklistType, value: string): string {
  const trimmed = value.trim();
  return type === 'EMAIL' ? trimmed.toLowerCase() : trimmed;
}

/** Checked at checkout-OTP request time and at order-creation time — see
 *  checkout-otp.service.ts and order.service.ts. */
export async function isBlacklisted(type: BlacklistType, value: string): Promise<boolean> {
  const entry = await prisma.blacklistEntry.findUnique({
    where: { type_value: { type, value: normalize(type, value) } },
    select: { id: true },
  });
  return Boolean(entry);
}

export function listBlacklistEntries() {
  return prisma.blacklistEntry.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createBlacklistEntry(input: {
  type: BlacklistType;
  value: string;
  reason?: string;
  createdBy: string;
}) {
  return prisma.blacklistEntry.create({
    data: {
      type: input.type,
      value: normalize(input.type, input.value),
      reason: input.reason,
      createdBy: input.createdBy,
    },
  });
}

export async function deleteBlacklistEntry(id: string): Promise<void> {
  const entry = await prisma.blacklistEntry.findUnique({ where: { id } });
  if (!entry) throw new AppError('NOT_FOUND', 'Blacklist entry not found');
  await prisma.blacklistEntry.delete({ where: { id } });
}
