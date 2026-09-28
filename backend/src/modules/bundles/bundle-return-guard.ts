import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/AppError';

export const BUNDLE_RETURN_MESSAGE = "Bundle returns aren't available yet. Please contact the store for assistance.";
export const BUNDLE_RETURN_MESSAGE_AR = 'إرجاع الباقات غير متاح حالياً. يرجى التواصل مع المتجر للمساعدة.';

/** Phase A must never pass a bundle snapshot to the legacy/per-line refund
 * calculator. Block the whole order, including returns of unrelated lines.
 * Called under the existing order lock by all request and whole-order paths. */
export async function assertBundleReturnsAvailable(tx: Prisma.TransactionClient, orderID: string) {
  if (await tx.orderBundle.count({ where: { orderID } })) {
    throw new AppError('CONFLICT', BUNDLE_RETURN_MESSAGE, { reason: 'BUNDLE_RETURNS_UNAVAILABLE', messageAr: BUNDLE_RETURN_MESSAGE_AR });
  }
  // Defensive backstop: a V3 line also blocks if a snapshot record is damaged.
  const lines = await tx.orderItem.findMany({ where: { orderID }, select: { priceBreakdown: true } });
  if (lines.some(({ priceBreakdown }) => priceBreakdown && typeof priceBreakdown === 'object' && !Array.isArray(priceBreakdown) && priceBreakdown.version === 3)) {
    throw new AppError('CONFLICT', BUNDLE_RETURN_MESSAGE, { reason: 'BUNDLE_RETURNS_UNAVAILABLE', messageAr: BUNDLE_RETURN_MESSAGE_AR });
  }
}
