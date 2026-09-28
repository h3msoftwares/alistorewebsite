'use client';

import { useState } from 'react';
import { Alert, Button, Field, Input, Modal } from '@/components/ui';
import { RefundMarkingDialog } from './refund-marking-dialog';
import { useCollectionSummary, useMarkOrderCollected } from '@/hooks/use-orders';
import { useUpdateReturnStatus } from '@/hooks/use-returns';
import type { OrderActionsApi } from '@/hooks/use-order-actions';
import { usePermissions } from '@/lib/rbac';
import { useReturnPermissions } from '@/hooks/use-return-permissions';
import { isApiError } from '@/lib/api';
import { collectionErrorMessage, refundBlockMessage, refundBlockReason } from '@/lib/refund-eligibility';
import type { CollectionInput, CollectionRecord, Order, Return } from '@/lib/types';

export function CollectionSection({ order, locale, oa }: { order: Order; locale: 'en' | 'ar'; oa: OrderActionsApi }) {
  const { has } = usePermissions();
  const canManage = has('payments:manage');
  const { canMarkRefunds: canMark } = useReturnPermissions();
  const canRead = has('payments:view') || has('orders:view');
  const { data, isPending, isError, refetch } = useCollectionSummary(order.id, canRead);
  const recordCollection = useMarkOrderCollected();
  const markReturn = useUpdateReturnStatus();
  const [amount, setAmount] = useState('');
  const [collectedAt, setCollectedAt] = useState('');
  const [collector, setCollector] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [correction, setCorrection] = useState<CollectionRecord | null>(null);
  const [reason, setReason] = useState('');
  const [pendingReturn, setPendingReturn] = useState<Return | null>(null);
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const money = (cents: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency', currency: order.currency, numberingSystem: 'latn',
  }).format(cents / 100);
  const date = (value: string) => new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US');
  const busy = oa.busyId === order.id || recordCollection.isPending || markReturn.isPending;

  const run = (fn: () => Promise<unknown>) => oa.run(order.id, async () => {
    try { return await fn(); } catch (error) {
      if (isApiError(error) && error.code === 'STEP_UP_REQUIRED') throw error;
      // A stale read can still be blocked by the authoritative transaction.
      void refetch();
      throw new Error(collectionErrorMessage(error, locale, t('Update failed', 'فشل التحديث')));
    }
  }, t('Update failed', 'فشل التحديث'));

  const submitCollection = () => {
    const body: CollectionInput = { collected: true, amount: Number(amount), currency: order.currency,
      collectedAt: new Date(collectedAt).toISOString(), collectorName: collector.trim(), reference: reference.trim() || null, note: note.trim() || undefined };
    void run(async () => {
      await recordCollection.mutateAsync({ id: order.id, body });
      setAmount(''); setCollectedAt(''); setCollector(''); setReference(''); setNote('');
    });
  };

  if (!canRead || order.paymentMethod !== 'COD') return null;
  return <section id="collection" className="admin-form stack" aria-label={t('Collection', 'التحصيل')} style={{ marginBlock: 'var(--space-5)' }}>
    <h2>{t('Collection', 'التحصيل')}</h2>
    {isPending ? <p>{t('Loading collection records…', 'جارٍ تحميل سجلات التحصيل…')}</p> : isError || !data ?
      <Alert tone="danger">{t('Could not load collection records.', 'تعذّر تحميل سجلات التحصيل.')} <Button variant="outline" onClick={() => refetch()}>{t('Retry', 'إعادة المحاولة')}</Button></Alert> : <>
      <dl className="stack">
        <div><dt>{t('Expected total', 'المبلغ الإجمالي المتوقع')}</dt><dd>{money(data.expectedTotalCents)}</dd></div>
        <div><dt>{t('Collected so far', 'المبلغ المحصل حتى الآن')}</dt><dd>{money(data.collectedCents)}</dd></div>
        <div><dt>{t('Merchandise marked refunded', 'قيمة البضائع المعلّمة كمستردة')}</dt><dd>{money(data.markedRefundedCents)}</dd></div>
        <div><dt>{t('Remaining refundable', 'المبلغ المتبقي القابل للاسترداد')}</dt><dd>{money(data.remainingRefundableCents)}</dd></div>
        <div><dt>{t('Delivery marked refunded', 'التوصيل المعلّم كمسترد')}</dt><dd>{money(data.markedDeliveryRefundedCents)}</dd></div>
        <div><dt>{t('Remaining delivery refundable', 'المبلغ المتبقي القابل للاسترداد للتوصيل')}</dt><dd>{money(data.remainingDeliveryRefundableCents)}</dd></div>
        <div><dt>{t('Remaining total refundable from net collected', 'إجمالي المبلغ المتبقي القابل للاسترداد من صافي التحصيل')}</dt><dd>{money(data.remainingTotalRefundableCents)}</dd></div>
      </dl>
      <p className="admin-form__hint">{t('Delivery fees are treated as collected first. Merchandise and delivery have separate caps; their combined amount marked refunded can never exceed net collected.', 'تُعتبر رسوم التوصيل محصّلة أولاً. للبضائع والتوصيل حدّان منفصلان؛ لا يمكن أن يتجاوز إجمالي المبالغ المعلّمة كمستردة صافي المبلغ المحصّل.')}</p>
      <h3>{t('Collection history', 'سجل التحصيل')}</h3>
      {!data.records.length && <p>{t('No collection recorded.', 'لم يُسجّل أي تحصيل.')}</p>}
      <ul className="stack" style={{ paddingInlineStart: 'var(--space-4)' }}>
        {data.records.map((record) => {
          const reversed = data.records.some((r) => r.reversalOfID === record.id);
          return <li key={record.id}>
            <strong>{record.reversalOfID ? t('Correction', 'تصحيح') : t('Collection recorded', 'تم تسجيل التحصيل')}: {money(Math.round(Number(record.amount) * 100))}</strong>
            <p>{t('Collection date', 'تاريخ التحصيل')}: {date(record.collectedAt)} · {t('Collector', 'المحصّل')}: {record.collectorName}</p>
            <p>{t('Receipt / reference', 'الإيصال / المرجع')}: {record.reference ?? t('Not provided', 'غير متوفر')}</p>
            <p>{t('Recorded by', 'سُجّل بواسطة')}: {record.actorName} · {date(record.createdAt)}</p>
            {record.note && <p>{t('Note', 'ملاحظة')}: {record.note}</p>}
            {record.reason && <p>{t('Correction reason', 'سبب التصحيح')}: {record.reason}</p>}
            {record.reversalOfID && <p>{t('Reverses record', 'يعكس السجل')}: {record.reversalOfID}</p>}
            {reversed && <p>{t('Reversed by a correction', 'عُكس بواسطة تصحيح')}</p>}
            {canManage && !record.reversalOfID && !reversed && <Button variant="outline" size="sm" disabled={busy} onClick={() => { setCorrection(record); setReason(''); }}>{t('Correct collection', 'تصحيح التحصيل')}</Button>}
          </li>;
        })}
      </ul>
      {canManage && <form className="stack" onSubmit={(e) => { e.preventDefault(); submitCollection(); }}>
        <h3>{t('Record collection', 'تسجيل التحصيل')}</h3>
        <Field label={t(`Amount (${order.currency})`, `المبلغ (${order.currency})`)}>{(p) => <Input {...p} type="number" min="0.01" step="0.01" max="9999999999.99" required value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label={t('Collection date', 'تاريخ التحصيل')}>{(p) => <Input {...p} type="datetime-local" required value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} />}</Field>
        <Field label={t('Collector / courier name', 'اسم المحصّل / المندوب')}>{(p) => <Input {...p} required maxLength={200} value={collector} onChange={(e) => setCollector(e.target.value)} />}</Field>
        <Field label={t('Receipt / reference (optional)', 'الإيصال / المرجع (اختياري)')}>{(p) => <Input {...p} maxLength={500} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        <Field label={t('Note (optional)', 'ملاحظة (اختياري)')}>{(p) => <Input {...p} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <Button type="submit" variant="primary" disabled={busy || !collector.trim()}>{t('Record collection', 'تسجيل التحصيل')}</Button>
      </form>}
      {(order.returns ?? []).filter((r) => r.status === 'RECEIVED').map((ret) => {
        const refundCents = ret.items.reduce((sum, i) => sum + Math.round(Number(i.refundAmount) * 100), 0);
        const block = refundBlockReason(refundCents, data);
        return <div key={ret.id} className="stack">
          <p>{t('Received return awaiting refund marking', 'مرتجع مستلم بانتظار تعليم الاسترداد')}: {money(refundCents)}</p>
          {block && <Alert tone="warning">{refundBlockMessage(block, locale)} {t('Remaining refundable', 'المبلغ المتبقي القابل للاسترداد')}: {money(data.remainingRefundableCents)}</Alert>}
          {canMark && <Button variant="outline" disabled={busy} onClick={() => setPendingReturn(ret)}>{t('Mark refunded', 'وضع علامة استرداد')}</Button>}
        </div>;
      })}
    </>}
    {correction && <Modal open onClose={() => setCorrection(null)} title={t('Correct collection', 'تصحيح التحصيل')} closeLabel={t('Close', 'إغلاق')}>
      <form className="admin-modal stack" onSubmit={(e) => {
        e.preventDefault();
        const body: CollectionInput = { collected: false, collectionID: correction.id, reason: reason.trim() };
        setCorrection(null);
        void run(() => recordCollection.mutateAsync({ id: order.id, body }));
      }}>
        <p>{t('This appends a reversal of the entire collection record. To replace an incorrect amount, record the correct collection separately afterward. The original record is preserved.', 'يضيف هذا عكساً لكامل سجل التحصيل. لاستبدال مبلغ غير صحيح، سجّل التحصيل الصحيح بشكل منفصل بعد ذلك. يُحفظ السجل الأصلي.')}</p>
        <p>{money(Math.round(Number(correction.amount) * 100))} · {correction.reference ?? t('Not provided', 'غير متوفر')}</p>
        <Field label={t('Correction reason', 'سبب التصحيح')}>{(p) => <Input {...p} required maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <Button type="submit" variant="primary" disabled={!reason.trim() || busy}>{t('Record correction', 'تسجيل التصحيح')}</Button>
      </form>
    </Modal>}
    {pendingReturn && data && canMark && <RefundMarkingDialog key={pendingReturn.id} locale={locale} currency={order.currency}
      calculatedCents={pendingReturn.items.reduce((sum, item) => sum + Math.round(Number(item.refundAmount) * 100), 0)}
      remainingRefundableCents={data.remainingRefundableCents}
      remainingDeliveryRefundableCents={data.remainingDeliveryRefundableCents}
      remainingTotalRefundableCents={data.remainingTotalRefundableCents}
      collectionCount={data.collectionCount} busy={busy} onClose={() => setPendingReturn(null)} onConfirm={amounts => {
        const id = pendingReturn.id; setPendingReturn(null);
        void run(() => markReturn.mutateAsync({ id, status: 'REFUNDED', amounts }));
      }} />}
  </section>;
}
