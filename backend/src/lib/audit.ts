import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Append a row to the `AuditLog` (append-only "who did what, when" trail).
 *
 * Best-effort: a failure here is logged but never thrown — recording an action
 * must not be able to fail the action itself. Mirrors the auth module's
 * `recordAttempt` pattern.
 */
export async function recordAudit(entry: {
  entityType: string;
  entityID: string;
  action: string;
  actorID?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: entry.entityType,
        entityID: entry.entityID,
        action: entry.action,
        actorID: entry.actorID ?? null,
        metadata: (entry.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[audit] failed to record ${entry.action}`, err);
  }
}
