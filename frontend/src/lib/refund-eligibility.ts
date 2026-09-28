import type { CollectionSummary, RefundBlockReason } from './types';
import { isApiError } from './api';

export function refundBlockReason(amountCents: number, summary: CollectionSummary): RefundBlockReason | null {
  if (amountCents === 0) return null;
  if (summary.collectionCount === 0) return 'NO_COLLECTION_RECORDED';
  return amountCents > summary.remainingRefundableCents ? 'EXCEEDS_REMAINING_REFUNDABLE' : null;
}
export function refundBlockMessage(reason: RefundBlockReason, locale: 'en' | 'ar'): string {
  if (reason === 'NO_COLLECTION_RECORDED') return locale === 'ar'
    ? 'لم يُسجّل تحصيل الدفع عند الاستلام. سجّل دليل التحصيل قبل وضع علامة استرداد هذا المبلغ.'
    : 'No COD collection recorded. Record collection evidence before marking this amount refunded.';
  return locale === 'ar' ? 'المبلغ يتجاوز المبلغ المتبقي القابل للاسترداد.' : 'Amount exceeds remaining refundable.';
}
export function collectionErrorMessage(error: unknown, locale: 'en' | 'ar', fallback: string): string {
  const reason = isApiError(error) ? (error.meta as { reason?: string } | undefined)?.reason : undefined;
  if (reason === 'NO_COLLECTION_RECORDED' || reason === 'EXCEEDS_REMAINING_REFUNDABLE') return refundBlockMessage(reason, locale);
  if (reason === 'COLLECTION_BELOW_MARKED_REFUNDS') return locale === 'ar'
    ? 'سيخفض التصحيح المبلغ المحصل إلى أقل من المبلغ المعلّم كمسترد.'
    : 'Correction would reduce collected money below the amount already marked refunded.';
  return error instanceof Error ? error.message : fallback;
}
