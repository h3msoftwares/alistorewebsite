import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import type { BlacklistType, Prisma } from '@prisma/client';

/** Either the shared client or an interactive-transaction client. Callers that
 *  are already inside a `$transaction` MUST pass their `tx` so the query runs
 *  on the transaction's own connection instead of borrowing a second one from
 *  the pool (see the checkout-burst finding in the production-readiness audit). */
type Db = typeof prisma | Prisma.TransactionClient;

// Emails are matched case-insensitively (accounts are stored lower-cased
// too); phone/IP are matched as-is — an admin enters them exactly as they
// appear on the order they're blocking.
function normalize(type: BlacklistType, value: string): string {
  const trimmed = value.trim();
  return type === 'EMAIL' ? trimmed.toLowerCase() : trimmed;
}

/**
 * Checked at checkout-OTP request time (outside any transaction — the
 * default `db = prisma`) and at order-creation time, from inside
 * checkout()'s transaction (fix-list.md #11, resolves 1.8) — the latter now
 * passes `tx` explicitly. Before this, every call here hardcoded the plain
 * `prisma` singleton regardless of caller, so each of checkout()'s up-to-3
 * blacklist checks (phone/email/IP) reached into the pool for its own,
 * separate connection *on top of* the one the enclosing transaction already
 * held — quietly doubling a checkout's real pool demand under concurrency,
 * and a real contributor to the pool exhausting well before the raw
 * concurrent-transaction count would suggest.
 */
export async function isBlacklisted(type: BlacklistType, value: string, db: Db = prisma): Promise<boolean> {
  const entry = await db.blacklistEntry.findUnique({
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
