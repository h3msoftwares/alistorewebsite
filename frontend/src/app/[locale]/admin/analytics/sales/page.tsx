'use client';

import { RefundAnalyticsNote } from '@/components/admin/analytics/refund-note';

import { useParams } from 'next/navigation';
import { MerchandiseSummary } from '@/components/admin/analytics/merchandise-summary';
import { MerchandiseBreakdown } from '@/components/admin/analytics/merchandise-breakdown';
import {
  BreakdownBars,
  ChartCard,
  DashboardState,
  SplitDonut,
  TrendLine,
} from '@/components/admin/analytics';
import { bucketLabel, money2 } from '@/components/admin/analytics/format';
import { useAnalyticsSales } from '@/hooks/use-analytics';
import type { Breakdown } from '@/lib/types';
import { useAnalyticsRange } from '../range-context';

const toBars = (rows: Breakdown[]) =>
  rows.slice(0, 8).map((r) => ({ label: r.label, value: r.revenue }));
const toSplit = (rows: Breakdown[]) =>
  rows.slice(0, 6).map((r) => ({ label: r.label, value: r.units }));

export default function AnalyticsSalesPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsSales(preset);

  return (
    <DashboardState query={query} isAr={isAr}>
      {(data) => {
        const series = data.revenueSeries.map((p) => ({
          x: bucketLabel(p.bucket),
          revenue: p.revenue,
          aov: p.orders ? p.revenue / p.orders : 0,
        }));
        return (
          <div className="analytics-page">
            <MerchandiseSummary metrics={data.summary} isAr={isAr} />
            <ChartCard title={t('Net order revenue & average order value', 'صافي إيرادات الطلبات ومتوسط قيمة الطلب')}>
              <TrendLine
                data={series}
                series={[
                  { key: 'revenue', label: t('Net order revenue', 'صافي إيرادات الطلبات') },
                  { key: 'aov', label: t('AOV', 'متوسط قيمة الطلب') },
                ]}
                formatY={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
            </ChartCard>

            <div className="analytics-page__row">
              <ChartCard title={t('Net merchandise value by category', 'صافي قيمة البضائع حسب الفئة')}>
                <BreakdownBars data={toBars(data.byCategory)} formatValue={money2} isAr={isAr} />
              </ChartCard>
              <ChartCard title={t('Net merchandise value by product', 'صافي قيمة البضائع حسب المنتج')}>
                <BreakdownBars data={toBars(data.byProduct)} formatValue={money2} isAr={isAr} />
              </ChartCard>
            </div>

            <div className="analytics-page__row">
              <ChartCard title={t('Retained units by size', 'الوحدات المحتفظ بها حسب المقاس')}>
                <SplitDonut data={toSplit(data.bySize)} isAr={isAr} />
              </ChartCard>
              <ChartCard title={t('Retained units by colour', 'الوحدات المحتفظ بها حسب اللون')}>
                <SplitDonut data={toSplit(data.byColour)} isAr={isAr} />
              </ChartCard>
            </div>

            {([
              [t('By category', 'حسب الفئة'), data.byCategory],
              [t('By product', 'حسب المنتج'), data.byProduct],
              [t('By size', 'حسب المقاس'), data.bySize],
              [t('By colour', 'حسب اللون'), data.byColour],
            ] as const).map(([title, rows]) => <ChartCard key={title} title={title} height="auto">
              <MerchandiseBreakdown rows={rows} isAr={isAr} />
            </ChartCard>)}
            <RefundAnalyticsNote isAr={isAr} note={data.note} />
          </div>
        );
      }}
    </DashboardState>
  );
}
