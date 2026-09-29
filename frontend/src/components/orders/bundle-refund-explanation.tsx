import type { BundleRefundCalculation } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

/** Group entitlement spans lines, so accounting shares alone cannot explain
 * the discount lost when a return breaks a recipe. */
export function BundleRefundExplanation({ calculation: c, locale }: { calculation: BundleRefundCalculation; locale: 'en' | 'ar' }) {
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const money = (cents: number) => formatCurrency(cents / 100, locale);
  const rows = [
    [t('Original amount paid for this Bundle and surplus', 'المبلغ الأصلي المدفوع لهذه الباقة والوحدات الإضافية'), c.originalNetCents],
    [t('Price of kept items', 'سعر الأصناف المحتفظ بها'), c.keptNetCents],
    [t('Bundle discount lost', 'خصم الباقة المفقود'), c.lostDiscountCents],
    [t('Previously calculated refund amounts', 'مبالغ الاسترداد المحسوبة سابقاً'), c.previousRefundCents],
    [t('Calculated refund for this Bundle', 'الاسترداد المحسوب لهذه الباقة'), c.refundCents],
  ] as const;
  return <div className="stack" style={{ marginBlock: 'var(--space-2)' }}>
    <strong>{t('Bundle', 'باقة')}: {locale === 'ar' ? c.nameAr : c.nameEn}</strong>
    <p>{t(`Complete Bundles kept: ${c.keptInstanceCount} of ${c.instanceCount}.`, `الباقات الكاملة المحتفظ بها: ${c.keptInstanceCount} من ${c.instanceCount}.`)}</p>
    {c.components.map(part => <p key={part.orderItemID}>{part.productName}: {c.keptQuantities[part.orderItemID]} × {money(part.individualPriceCents)} {t('(individual price at purchase)', '(السعر الفردي وقت الشراء)')}</p>)}
    {rows.map(([label, cents]) => <div className="checkout__row" key={label}><span>{label}</span><span className="is-numeric">{money(cents)}</span></div>)}
    <p>{t('Surplus units are returned first. Complete recipes keep their Bundle price; remaining units use their individual sale/promotion price at purchase.', 'تُرجع الوحدات الإضافية أولاً. تحتفظ الباقات الكاملة بسعرها، وتُحسب الوحدات المتبقية بسعرها الفردي مع التخفيضات والعروض وقت الشراء.')}</p>
  </div>;
}
