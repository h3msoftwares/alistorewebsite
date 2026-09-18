'use client';

import { useParams } from 'next/navigation';
import {
  BreakdownBars,
  ChartCard,
  DashboardState,
  SplitDonut,
  TrendLine,
} from '@/components/admin/analytics';
import { bucketLabel, money } from '@/components/admin/analytics/format';
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
          aov: p.orders ? Math.round(p.revenue / p.orders) : 0,
        }));
        return (
          <div className="analytics-page">
            <ChartCard title={t('Revenue & average order value', 'الإيرادات ومتوسط قيمة الطلب')}>
              <TrendLine
                data={series}
                series={[
                  { key: 'revenue', label: t('Revenue', 'الإيرادات') },
                  { key: 'aov', label: t('AOV', 'متوسط قيمة الطلب') },
                ]}
                formatY={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
            </ChartCard>

            <div className="analytics-page__row">
              <ChartCard title={t('Revenue by category', 'الإيرادات حسب الفئة')}>
                <BreakdownBars data={toBars(data.byCategory)} formatValue={money} isAr={isAr} />
              </ChartCard>
              <ChartCard title={t('Revenue by product', 'الإيرادات حسب المنتج')}>
                <BreakdownBars data={toBars(data.byProduct)} formatValue={money} isAr={isAr} />
              </ChartCard>
            </div>

            <div className="analytics-page__row">
              <ChartCard title={t('Units by size', 'الوحدات حسب المقاس')}>
                <SplitDonut data={toSplit(data.bySize)} isAr={isAr} />
              </ChartCard>
              <ChartCard title={t('Units by colour', 'الوحدات حسب اللون')}>
                <SplitDonut data={toSplit(data.byColour)} isAr={isAr} />
              </ChartCard>
            </div>

            <p className="analytics-note">{data.note}</p>
          </div>
        );
      }}
    </DashboardState>
  );
}
