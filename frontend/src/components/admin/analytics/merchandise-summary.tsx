'use client';

import { StatGrid, StatTile } from '@/components/admin/analytics';
import { money2, num } from './format';
import type { MerchandiseMetrics } from '@/lib/types';

export function MerchandiseSummary({ metrics: m, isAr }: { metrics: MerchandiseMetrics; isAr: boolean }) {
  const t = (en: string, ar: string) => isAr ? ar : en;
  return <StatGrid>
    <StatTile label={t('Merchandise value after coupons', 'قيمة البضائع بعد القسائم')} value={money2(m.merchandiseValue)} />
    <StatTile label={t('Merchandise marked refunded', 'قيمة البضائع المعلّمة كمستردة')} value={money2(m.merchandiseMarkedRefunded)} />
    <StatTile label={t('Net merchandise value after marked refunds', 'صافي قيمة البضائع بعد الاستردادات المعلّمة')} value={money2(m.netMerchandiseValue)} />
    <StatTile label={t('Received returns awaiting refund marking', 'مرتجعات مستلمة بانتظار تعليم الاسترداد')} value={money2(m.receivedReturnsAwaitingRefundMarking)} />
    <StatTile label={t('Ordered units', 'الوحدات المطلوبة')} value={num(m.orderedUnits)} />
    <StatTile label={t('Physically returned units', 'الوحدات المرتجعة والمستلمة')} value={num(m.physicallyReturnedUnits)} />
    <StatTile label={t('Retained units', 'الوحدات المحتفظ بها')} value={num(m.retainedUnits)} />
  </StatGrid>;
}
