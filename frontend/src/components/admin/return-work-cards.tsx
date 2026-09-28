'use client';

import Link from 'next/link';
import { Alert, Button } from '@/components/ui';
import { StatGrid } from '@/components/admin/analytics';
import { useReturnWorkSummary } from '@/hooks/use-orders';
import { usePermissions } from '@/lib/rbac';
import { formatCurrency } from '@/lib/format';

export function ReturnWorkCards({ locale }: { locale: 'en' | 'ar' }) {
  const canRead = usePermissions().has('orders:view');
  const query = useReturnWorkSummary(canRead);
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  if (!canRead) return null;
  if (query.isPending) return <p>{t('Loading return indicators…', 'جارٍ تحميل مؤشرات المرتجعات…')}</p>;
  if (query.isError) return <Alert tone="warning">{t('Could not load return indicators.', 'تعذّر تحميل مؤشرات المرتجعات.')} <Button variant="ghost" onClick={() => query.refetch()}>{t('Retry', 'إعادة المحاولة')}</Button></Alert>;
  const d = query.data;
  const tiles = [
    { label: t('Return requests awaiting approval', 'طلبات إرجاع بانتظار الموافقة'), filter: 'AWAITING_APPROVAL', value: d.awaitingApproval },
    { label: t('Returns in transit', 'مرتجعات في الطريق'), filter: 'IN_TRANSIT', value: d.inTransit },
    { label: t('Refund due', 'استرداد مستحق'), filter: 'REFUND_DUE', value: d.refundDue ?? d.awaitingRefundMarking },
  ];
  return <section>
    <h2 className="admin-dashboard__section-title">{t('Return and refund work', 'متابعة الإرجاع وتعليم الاسترداد')}</h2>
    <StatGrid>{tiles.map(tile => <Link key={tile.filter} className="stat-tile stat-tile--link" href={`/${locale}/admin/orders?returnFilter=${tile.filter}`}>
      <span className="stat-tile__label">{tile.label}</span>
      <span className="stat-tile__value">{tile.value.count}</span>
      <span className="stat-tile__hint">{formatCurrency(tile.value.amountCents / 100, locale)}</span>
    </Link>)}</StatGrid>
    <p className="analytics-note">{t('Refund due counts received returns and owed goodwill. Return amounts are saved merchandise calculations; delivery is chosen when paying the return.', 'الاسترداد المستحق يشمل المرتجعات المستلمة والاستردادات الإضافية غير المدفوعة. مبالغ المرتجعات هي حسابات البضائع المحفوظة؛ يُحدّد استرداد التوصيل عند دفع المرتجع.')}</p>
  </section>;
}
