'use client';

import { useState } from 'react';
import { Alert, Button, Choice, Field, Input, Modal } from '@/components/ui';
import { refundBlockMessage } from '@/lib/refund-eligibility';
import type { RefundBlockReason, RefundMarkingInput } from '@/lib/types';
import { CashPayoutFields, initialPayout, validPayout, cashPayoutInput } from './cash-payout-fields';

/** Parse decimal dollars into cents without accepting negative/scientific values
 * or silently rounding sub-cent input. The API takes integer cents. */
export function cents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result <= 999999999999 ? result : null;
}

export function RefundMarkingDialog({ locale, currency = 'USD', calculatedCents, remainingRefundableCents,
  remainingDeliveryRefundableCents, remainingTotalRefundableCents, collectionCount, busy, onClose, onConfirm }: {
  locale: 'en' | 'ar'; currency?: string; calculatedCents: number;
  remainingRefundableCents: number; remainingDeliveryRefundableCents: number; remainingTotalRefundableCents: number;
  collectionCount: number; busy?: boolean; onClose: () => void; onConfirm: (input: RefundMarkingInput) => void;
}) {
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const money = (value: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency', currency, numberingSystem: 'latn',
  }).format(value / 100);
  const [amount, setAmount] = useState((calculatedCents / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [includeDelivery, setIncludeDelivery] = useState(false);
  const [deliveryAmount, setDeliveryAmount] = useState('');
  const [deliveryReason, setDeliveryReason] = useState('');
  const [payout, setPayout] = useState(initialPayout);
  const merchandise = cents(amount);
  const delivery = includeDelivery ? cents(deliveryAmount) : 0;
  const adjusted = merchandise !== calculatedCents;
  let block: RefundBlockReason | null = null;
  if ((merchandise ?? 0) + (delivery ?? 0) > 0 && collectionCount === 0) block = 'NO_COLLECTION_RECORDED';
  else if (merchandise !== null && merchandise > remainingRefundableCents) block = 'EXCEEDS_REMAINING_REFUNDABLE';
  else if (delivery !== null && delivery > remainingDeliveryRefundableCents) block = 'EXCEEDS_DELIVERY_REFUNDABLE';
  else if (merchandise !== null && delivery !== null && merchandise + delivery > remainingTotalRefundableCents) block = 'EXCEEDS_NET_COLLECTED';
  const valid = merchandise !== null && delivery !== null && !block && (!adjusted || !!reason.trim())
    && (!includeDelivery || (delivery > 0 && !!deliveryReason.trim()))
    && ((merchandise ?? 0) + (delivery ?? 0) === 0 || validPayout(payout));
  return <Modal open onClose={onClose} title={t('Mark this return refunded?', 'وضع علامة استرداد لهذا المرتجع؟')} closeLabel={t('Close', 'إغلاق')}>
    <form className="admin-modal stack" onSubmit={event => {
      event.preventDefault();
      if (!valid || merchandise === null || delivery === null) return;
      onConfirm({ merchandiseRefundCents: merchandise, refundAdjustmentReason: reason.trim() || undefined,
        deliveryRefundCents: delivery, deliveryRefundReason: includeDelivery ? deliveryReason.trim() : undefined,
        ...(merchandise + delivery > 0 ? { payout: cashPayoutInput(payout) } : {}) });
    }}>
      <p>{t('Calculated merchandise amount', 'مبلغ البضائع المحسوب')}: {money(calculatedCents)}</p>
      <p>{t('Remaining merchandise refundable', 'المبلغ المتبقي القابل للاسترداد للبضائع')}: {money(remainingRefundableCents)}</p>
      <p>{t('Remaining delivery refundable', 'المبلغ المتبقي القابل للاسترداد للتوصيل')}: {money(remainingDeliveryRefundableCents)}</p>
      <p>{t('Remaining total refundable from net collected', 'إجمالي المبلغ المتبقي القابل للاسترداد من صافي التحصيل')}: {money(remainingTotalRefundableCents)}</p>
      <p className="admin-form__hint">{t('Merchandise and delivery have separate caps. Their combined amount refunded can never exceed net collected. Delivery is treated as collected first.',
        'للبضائع والتوصيل حدّان منفصلان. لا يمكن أن يتجاوز إجمالي المبالغ المستردة صافي المبلغ المحصّل. يُعتبر التوصيل محصّلاً أولاً.')}</p>
      <Field label={t(`Merchandise amount refunded (${currency})`, `مبلغ البضائع المسترد (${currency})`)}>{p => <Input {...p} type="number" min="0" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} />}</Field>
      <Field label={t('Adjustment reason', 'سبب التعديل')}>{p => <Input {...p} maxLength={1000} required={adjusted} value={reason} onChange={event => setReason(event.target.value)} />}</Field>
      {adjusted && <p>{t('A reason is required when the amount differs from the calculation, including zero.', 'يلزم سبب عندما يختلف المبلغ عن الحساب، بما في ذلك الصفر.')}</p>}
      <Choice label={t('Also mark delivery refunded', 'تعليم مبلغ التوصيل أيضاً كمسترد')} checked={includeDelivery} onChange={event => setIncludeDelivery(event.target.checked)} />
      {includeDelivery && <>
        <Field label={t(`Delivery amount refunded (${currency})`, `مبلغ التوصيل المسترد (${currency})`)}>{p => <Input {...p} type="number" min="0.01" step="0.01" required value={deliveryAmount} onChange={event => setDeliveryAmount(event.target.value)} />}</Field>
        <Field label={t('Delivery refund reason', 'سبب استرداد التوصيل')}>{p => <Input {...p} required maxLength={1000} value={deliveryReason} onChange={event => setDeliveryReason(event.target.value)} />}</Field>
      </>}
      {(merchandise ?? 0) + (delivery ?? 0) > 0 && <CashPayoutFields locale={locale} value={payout} onChange={setPayout} />}
      {block && <Alert tone="warning">{refundBlockMessage(block, locale)}</Alert>}
      <div className="admin-modal__actions">
        <Button type="button" variant="ghost" onClick={onClose}>{t('Cancel', 'إلغاء')}</Button>
        <Button type="submit" variant="primary" disabled={!valid || busy}>{t('Mark refunded', 'وضع علامة استرداد')}</Button>
      </div>
    </form>
  </Modal>;
}
