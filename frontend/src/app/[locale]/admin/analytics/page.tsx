'use client';

import { useParams } from 'next/navigation';
import { MerchandiseSummary } from '@/components/admin/analytics/merchandise-summary';
import {
  ChartCard,
  DashboardState,
  FunnelSteps,
  GaNotConnected,
  StatGrid,
  StatTile,
  TrendLine,
} from '@/components/admin/analytics';
import { bucketLabel, money2, num } from '@/components/admin/analytics/format';
import { useAnalyticsOverview } from '@/hooks/use-analytics';
import { useAnalyticsRange } from './range-context';

export default function AnalyticsOverviewPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsOverview(preset);

  return (
    <DashboardState query={query} isAr={isAr}>
      {(data) => {
        const k = data.kpis;
        const series = data.revenueSeries.map((p) => ({
          x: bucketLabel(p.bucket),
          revenue: p.revenue,
          orders: p.orders,
        }));
        return (
          <div className="analytics-page">
            <MerchandiseSummary metrics={k} isAr={isAr} />
            <StatGrid>
              <StatTile label={t('Delivery fees', 'رسوم التوصيل')} value={money2(k.deliveryRevenue)} />
              <StatTile label={t('Orders', 'الطلبات')} value={num(k.orders)} hint={t(`${k.itemsPerOrder.toFixed(1)} items / order`, `${k.itemsPerOrder.toFixed(1)} عنصر / طلب`)} />
              <StatTile label={t('Avg order value', 'متوسط قيمة الطلب')} value={money2(k.averageOrderValue)} />
              <StatTile label={t('New customers', 'عملاء جدد')} value={num(k.newCustomers)} />
              <StatTile label={t('Returning customers', 'عملاء عائدون')} value={num(k.returningCustomers)} />
              <StatTile label={t('Low-stock variants', 'خيارات منخفضة المخزون')} value={num(k.lowStockVariants)} />
            </StatGrid>

            <ChartCard title={t('Net merchandise value & orders', 'صافي قيمة البضائع والطلبات')} subtitle={t('After coupons and marked refunds; excludes cancelled orders', 'بعد القسائم والاستردادات المعلّمة؛ باستثناء الطلبات الملغاة')}>
              <TrendLine
                data={series}
                series={[
                  { key: 'revenue', label: t('Net merchandise value after marked refunds', 'صافي قيمة البضائع بعد الاستردادات المعلّمة') },
                  { key: 'orders', label: t('Orders', 'الطلبات') },
                ]}
                formatY={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
            </ChartCard>

            <ChartCard title={t('Conversion funnel', 'قمع التحويل')} subtitle={t('From Google Analytics 4', 'من Google Analytics 4')} height="auto">
              {data.funnel.configured ? (
                <FunnelSteps steps={data.funnel.steps} isAr={isAr} />
              ) : (
                <GaNotConnected what={t('The funnel', 'قمع التحويل')} isAr={isAr} />
              )}
            </ChartCard>

            <p className="analytics-note">{data.note}</p>
          </div>
        );
      }}
    </DashboardState>
  );
}
