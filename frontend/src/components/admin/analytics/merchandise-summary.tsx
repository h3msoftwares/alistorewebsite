'use client';

import { StatGrid, StatTile } from '@/components/admin/analytics';
import { money2, num } from './format';
import type { MerchandiseMetrics } from '@/lib/types';

export function MerchandiseSummary({ metrics: m, isAr }: { metrics: MerchandiseMetrics; isAr: boolean }) {
  const t = (en: string, ar: string) => isAr ? ar : en;
  return <StatGrid>
    <StatTile label={t('Merchandise value after coupons', 'قيمة البضائع بعد القسائم')} value={money2(m.merchandiseValue)} />
    <StatTile label={t('Merchandise refunded', 'قيمة البضائع المستردة')} value={money2(m.merchandiseMarkedRefunded)} />
    <StatTile label={t('Net merchandise value after refunds', 'صافي قيمة البضائع بعد الاستردادات')} value={money2(m.netMerchandiseValue)} />
    <StatTile label={t('Refund due', 'استرداد مستحق')} value={money2(m.refundDueAmount ?? m.receivedReturnsAwaitingRefundMarking)} />
    {m.paidGoodwill !== undefined && <StatTile label={t('Paid goodwill refunds', 'الاستردادات الإضافية المدفوعة')} value={money2(m.paidGoodwill)} />}
    {m.netOrderRevenue !== undefined && <StatTile label={t('Net order revenue', 'صافي إيرادات الطلبات')} value={money2(m.netOrderRevenue)} />}
    <StatTile label={t('Ordered units', 'الوحدات المطلوبة')} value={num(m.orderedUnits)} />
    <StatTile label={t('Physically returned units', 'الوحدات المرتجعة والمستلمة')} value={num(m.physicallyReturnedUnits)} />
    <StatTile label={t('Retained units', 'الوحدات المحتفظ بها')} value={num(m.retainedUnits)} />
  </StatGrid>;
}
