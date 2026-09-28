'use client';

import { Field, Input } from '@/components/ui';
import type { CashPayoutInput } from '@/lib/types';

export function payoutToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Beirut', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function initialPayout(): CashPayoutInput { return { payerName: '', paidOn: payoutToday(), reference: '', note: '' }; }
export function validPayout(value: CashPayoutInput) {
  return !!value.payerName.trim() && !!value.paidOn && /^\d{4}-\d{2}-\d{2}$/.test(value.paidOn)
    && value.paidOn <= payoutToday();
}
export function cashPayoutInput(value: CashPayoutInput): CashPayoutInput {
  return { ...value, payerName: value.payerName.trim(), reference: value.reference?.trim() || null, note: value.note?.trim() || null };
}
export function CashPayoutFields({ locale, value, onChange }: {
  locale: 'en' | 'ar'; value: CashPayoutInput; onChange: (value: CashPayoutInput) => void;
}) {
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const update = (key: keyof CashPayoutInput, text: string) => onChange({ ...value, [key]: text });
  return <fieldset className="stack">
    <legend>{t('Cash payout', 'دفع الاسترداد نقداً')}</legend>
    <Field label={t('Paid by', 'اسم من دفع')}>{p => <Input {...p} required maxLength={200} value={value.payerName} onChange={e => update('payerName', e.target.value)} />}</Field>
    <Field label={t('Payout date', 'تاريخ الدفع')}>{p => <Input {...p} type="date" required max={payoutToday()} value={value.paidOn ?? ''} onChange={e => update('paidOn', e.target.value)} />}</Field>
    <Field label={t('Payout reference (optional)', 'مرجع الدفع (اختياري)')}>{p => <Input {...p} maxLength={1000} value={value.reference ?? ''} onChange={e => update('reference', e.target.value)} />}</Field>
    <Field label={t('Payout note (optional)', 'ملاحظة الدفع (اختياري)')}>{p => <Input {...p} maxLength={1000} value={value.note ?? ''} onChange={e => update('note', e.target.value)} />}</Field>
  </fieldset>;
}
