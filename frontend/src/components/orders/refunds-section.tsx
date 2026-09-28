'use client';

import { useState } from 'react';
import { Alert, Button, Choice, Field, Input, Modal } from '@/components/ui';
import { useReturnPermissions } from '@/hooks/use-return-permissions';
import { useRefundSummary, useGoodwillAction } from '@/hooks/use-refunds';
import { usePermissions } from '@/lib/rbac';
import { isApiError } from '@/lib/api';
import { collectionErrorMessage } from '@/lib/refund-eligibility';
import type { OrderActionsApi } from '@/hooks/use-order-actions';
import type { GoodwillRefund, Order } from '@/lib/types';
import { CashPayoutFields, cashPayoutInput, initialPayout, validPayout } from './cash-payout-fields';
import { cents } from './refund-marking-dialog';

type Dialog = { action: 'create' } | { action: 'pay' | 'cancel'; refund: GoodwillRefund };
export function RefundsSection({ order, locale, oa }: { order: Order; locale: 'en' | 'ar'; oa: OrderActionsApi }) {
  const canRead = usePermissions().has('orders:view');
  const { canMarkRefunds } = useReturnPermissions();
  const query = useRefundSummary(order.id, canRead);
  const mutation = useGoodwillAction(order.id);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const money = (amount: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency', currency: order.currency, numberingSystem: 'latn',
  }).format(amount);
  const busy = mutation.isPending || oa.busyId === order.id;
  if (!canRead) return null;
  const data = query.data;
  const legacy = (order.returns ?? []).filter(r => r.status === 'REFUNDED' && data && !data.payouts.some(p => p.returnID === r.id));
  return <section id="refunds" className="admin-form stack" aria-label={t('Refunds', 'الاستردادات')} style={{ marginBlock: 'var(--space-5)' }}>
    <h2>{t('Refunds', 'الاستردادات')}</h2>
    {query.isPending ? <p>{t('Loading refunds…', 'جارٍ تحميل الاستردادات…')}</p> : query.isError || !data
      ? <Alert tone="danger">{t('Could not load refunds.', 'تعذّر تحميل الاستردادات.')} <Button onClick={() => query.refetch()}>{t('Retry', 'إعادة المحاولة')}</Button></Alert>
      : <>
        <p>{t('Goodwill reserved (owed or paid)', 'مبالغ الاسترداد الإضافي المحجوزة (مستحقة أو مدفوعة)')}: {money(data.goodwillReservedCents / 100)}</p>
        <p>{t('Remaining total refundable', 'إجمالي المبلغ المتبقي القابل للاسترداد')}: {money(data.remainingTotalRefundableCents / 100)}</p>
        {canMarkRefunds && <Button variant="outline" disabled={busy} onClick={() => setDialog({ action: 'create' })}>{t('Create goodwill refund', 'إنشاء استرداد إضافي')}</Button>}
        <h3>{t('Goodwill refunds', 'الاستردادات الإضافية')}</h3>
        {!data.goodwillRefunds.length && <p>{t('No goodwill refunds.', 'لا توجد استردادات إضافية.')}</p>}
        <ul className="stack">
          {data.goodwillRefunds.map(refund => <li key={refund.id}>
            <strong>{money(Number(refund.amount))} · {refund.status === 'OWED' ? t('Refund due', 'استرداد مستحق')
              : refund.status === 'PAID' ? t('Paid', 'مدفوع') : t('Cancelled', 'ملغى')}</strong>
            <p>{t('Reason', 'السبب')}: {refund.reason}</p>
            {refund.cancellationReason && <p>{t('Cancellation reason', 'سبب الإلغاء')}: {refund.cancellationReason}</p>}
            {refund.status === 'OWED' && canMarkRefunds && <div className="admin-row-actions">
              <Button disabled={busy} onClick={() => setDialog({ action: 'pay', refund })}>{t('Pay cash refund', 'دفع الاسترداد نقداً')}</Button>
              <Button variant="outline" disabled={busy} onClick={() => setDialog({ action: 'cancel', refund })}>{t('Cancel goodwill refund', 'إلغاء الاسترداد الإضافي')}</Button>
            </div>}
          </li>)}
        </ul>
        <h3>{t('Cash payouts', 'دفعات الاسترداد النقدية')}</h3>
        {!data.payouts.length && <p>{t('No cash payouts recorded.', 'لم تُسجّل دفعات استرداد نقدية.')}</p>}
        <ul className="stack">
          {data.payouts.map(payout => <li key={payout.id}>
            <strong>{money(Number(payout.amount))} · {payout.returnID ? t('Return refund', 'استرداد مرتجع') : t('Goodwill refund', 'استرداد إضافي')}</strong>
            <p>{t('Paid by', 'اسم من دفع')}: {payout.payerName} · {t('Payout date', 'تاريخ الدفع')}: {payout.paidOn.slice(0, 10)}</p>
            <p>{t('Recorded by', 'سُجّل بواسطة')}: {payout.actorName}</p>
            {payout.reference && <p>{t('Reference', 'المرجع')}: {payout.reference}</p>}
            {payout.note && <p>{t('Note', 'ملاحظة')}: {payout.note}</p>}
          </li>)}
          {legacy.map(ret => <li key={ret.id}>{t('Refunded return', 'مرتجع مسترد')} · {money(Number(ret.refundedAmount ?? ret.refundAmount) + Number(ret.deliveryRefundAmount ?? 0))} · {t('No payout record', 'لا يوجد سجل دفع')}</li>)}
        </ul>
      </>}
    {dialog && data && canMarkRefunds && <GoodwillDialog locale={locale} currency={order.currency} dialog={dialog} busy={busy}
      remainingCents={data.remainingTotalRefundableCents} collectionCount={data.collectionCount} onClose={() => setDialog(null)}
      onConfirm={input => {
        setDialog(null);
        void oa.run(order.id, async () => {
          try { return await mutation.mutateAsync(input); } catch (error) {
            if (isApiError(error) && error.code === 'STEP_UP_REQUIRED') throw error;
            void query.refetch();
            throw new Error(collectionErrorMessage(error, locale, t('Could not update the refund.', 'تعذّر تحديث الاسترداد.')));
          }
        }, t('Could not update the refund.', 'تعذّر تحديث الاسترداد.'));
      }} />}
  </section>;
}

export function GoodwillDialog({ locale, currency, dialog, remainingCents, collectionCount, busy, onClose, onConfirm }: {
  locale: 'en' | 'ar'; currency: string; dialog: Dialog; remainingCents: number; collectionCount: number; busy?: boolean;
  onClose: () => void; onConfirm: (input: Parameters<ReturnType<typeof useGoodwillAction>['mutate']>[0]) => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [paidNow, setPaidNow] = useState(false);
  const [payout, setPayout] = useState(initialPayout);
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const amountCents = cents(amount);
  const needsPayout = dialog.action === 'pay' || (dialog.action === 'create' && paidNow);
  const valid = dialog.action === 'cancel' ? !!reason.trim() : (!needsPayout || validPayout(payout))
    && (dialog.action !== 'create' || (amountCents !== null && amountCents > 0 && amountCents <= remainingCents && !!reason.trim() && collectionCount > 0));
  const title = dialog.action === 'create' ? t('Create goodwill refund', 'إنشاء استرداد إضافي')
    : dialog.action === 'pay' ? t('Pay cash refund', 'دفع الاسترداد نقداً') : t('Cancel goodwill refund', 'إلغاء الاسترداد الإضافي');
  return <Modal open title={title} closeLabel={t('Close', 'إغلاق')} onClose={onClose}>
    <form className="admin-modal stack" onSubmit={e => {
      e.preventDefault(); if (!valid) return;
      if (dialog.action === 'cancel') onConfirm({ action: 'cancel', id: dialog.refund.id, reason: reason.trim() });
      else if (dialog.action === 'pay') onConfirm({ action: 'pay', id: dialog.refund.id, body: cashPayoutInput(payout) });
      else if (amountCents !== null) onConfirm({ action: 'create', body: { amountCents, reason: reason.trim(), paidNow,
        ...(paidNow ? { payout: cashPayoutInput(payout) } : {}) } });
    }}>
      {dialog.action === 'create' ? <>
        <p>{t('Remaining total refundable', 'إجمالي المبلغ المتبقي القابل للاسترداد')}: {(remainingCents / 100).toFixed(2)} {currency}</p>
        {!collectionCount && <Alert tone="warning">{t('Collection evidence is required.', 'يلزم وجود سجل تحصيل.')}</Alert>}
        <Field label={t(`Goodwill amount (${currency})`, `مبلغ الاسترداد الإضافي (${currency})`)}>{p => <Input {...p} type="number" min="0.01" step="0.01" max={(remainingCents / 100).toFixed(2)} required value={amount} onChange={e => setAmount(e.target.value)} />}</Field>
        <Field label={t('Reason', 'السبب')}>{p => <Input {...p} required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />}</Field>
        <Choice label={t('Paid now', 'مدفوع الآن')} checked={paidNow} onChange={e => setPaidNow(e.target.checked)} />
      </> : <p>{Number(dialog.refund.amount).toFixed(2)} {currency}</p>}
      {dialog.action === 'cancel' && <Field label={t('Cancellation reason', 'سبب الإلغاء')}>{p => <Input {...p} required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />}</Field>}
      {needsPayout && <CashPayoutFields locale={locale} value={payout} onChange={setPayout} />}
      <div className="admin-modal__actions">
        <Button type="button" variant="ghost" onClick={onClose}>{t('Close', 'إغلاق')}</Button>
        <Button type="submit" variant="primary" disabled={!valid || busy}>{title}</Button>
      </div>
    </form>
  </Modal>;
}
