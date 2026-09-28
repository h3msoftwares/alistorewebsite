'use client';

import { Badge } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { OrderReturnIndicators as Indicators } from '@/lib/types';

/** Two independent indicators, with concurrent pending/completed work visible. */
export function OrderReturnIndicators({ indicators: s, locale, customer = false, compact = false }: {
  indicators?: Indicators; locale: 'en' | 'ar'; customer?: boolean; compact?: boolean;
}) {
  if (!s) return null;
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const money = (cents: number) => formatCurrency(cents / 100, locale);
  const quantities = t(`${s.physicallyReturnedUnits} of ${s.orderedUnits} units`, `${s.physicallyReturnedUnits} من ${s.orderedUnits} وحدات`);
  const returnLabel = s.returnStatus === 'FULLY_RETURNED' ? t('Fully returned', 'مرتجع بالكامل')
    : s.returnStatus === 'PARTIALLY_RETURNED' ? t('Partially returned', 'مرتجع جزئيًا')
    : s.returnStatus === 'IN_PROGRESS' ? t('Return in progress', 'إرجاع قيد التنفيذ') : t('None', 'لا يوجد');
  const refundLabel = s.refundStatus === 'FULLY_MARKED' ? t('Fully marked refunded', 'معلّم كمسترد بالكامل')
    : s.refundStatus === 'PARTIALLY_MARKED' ? t('Partially marked refunded', 'معلّم كمسترد جزئيًا')
    : s.refundStatus === 'AWAITING_MARKING' ? t('Received, awaiting refund marking', 'مستلم بانتظار تعليم الاسترداد') : t('None', 'لا يوجد');
  return <div className="stack" style={{ gap: 'var(--space-2)', marginBlock: compact ? 'var(--space-2)' : 'var(--space-3)', fontSize: 'var(--fs-sm)' }}>
    <div>
      <strong>{t('Returns', 'المرتجعات')}: </strong>
      <Badge variant={s.physicallyReturnedUnits ? 'restock' : 'low-stock'} style={{ whiteSpace: 'normal' }}>
        {returnLabel}{s.physicallyReturnedUnits > 0 && ` · ${quantities}`}
      </Badge>
      {s.inProgressReturns > 0 && <div>{t(`Return in progress: ${s.inProgressUnits} units · pending amount ${money(s.pendingRefundCents)}`, `إرجاع قيد التنفيذ: ${s.inProgressUnits} وحدات · مبلغ معلّق ${money(s.pendingRefundCents)}`)}</div>}
    </div>
    <div>
      <strong>{t('Marked refunded', 'معلّم كمسترد')}: </strong>
      <Badge variant={s.markedReturns ? 'restock' : 'low-stock'} style={{ whiteSpace: 'normal' }}>{refundLabel}</Badge>
      {s.markedReturns > 0 && <div>{t(`Marked refunded: ${money(s.markedRefundCents)} of ${money(s.originalMerchandiseCents)}`, `معلّم كمسترد: ${money(s.markedRefundCents)} من ${money(s.originalMerchandiseCents)}`)}</div>}
      {s.awaitingMarkingReturns > 0 && <div>{t(`Received returns awaiting refund marking: ${money(s.awaitingMarkingCents)}`, `مرتجعات مستلمة بانتظار تعليم الاسترداد: ${money(s.awaitingMarkingCents)}`)}</div>}
    </div>
    {!compact && <p className="prose" style={{ margin: 0 }}>{customer
      ? t('Marked refunded means the store recorded a refund marking; it does not confirm that you received money. Amounts exclude delivery fees.', 'معلّم كمسترد يعني أن المتجر سجل تعليمًا للاسترداد؛ لا يؤكد استلامك المال. المبالغ لا تشمل رسوم التوصيل.')
      : t('Marked refunded is an administrative record, not proof of payment. Amounts exclude delivery fees.', 'معلّم كمسترد هو سجل إداري وليس إثبات دفع. المبالغ لا تشمل رسوم التوصيل.')}</p>}
  </div>;
}
