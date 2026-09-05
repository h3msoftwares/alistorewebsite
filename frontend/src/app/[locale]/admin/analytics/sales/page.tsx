'use client';

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
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsSales(preset);

  return (
    <DashboardState query={query}>
      {(data) => {
        const series = data.revenueSeries.map((p) => ({
          x: bucketLabel(p.bucket),
          revenue: p.revenue,
          aov: p.orders ? Math.round(p.revenue / p.orders) : 0,
        }));
        return (
          <div className="analytics-page">
            <ChartCard title="Revenue & average order value">
              <TrendLine
                data={series}
                series={[
                  { key: 'revenue', label: 'Revenue' },
                  { key: 'aov', label: 'AOV' },
                ]}
                formatY={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
            </ChartCard>

            <div className="analytics-page__row">
              <ChartCard title="Revenue by category">
                <BreakdownBars data={toBars(data.byCategory)} formatValue={money} />
              </ChartCard>
              <ChartCard title="Revenue by product">
                <BreakdownBars data={toBars(data.byProduct)} formatValue={money} />
              </ChartCard>
            </div>

            <div className="analytics-page__row">
              <ChartCard title="Units by size">
                <SplitDonut data={toSplit(data.bySize)} />
              </ChartCard>
              <ChartCard title="Units by colour">
                <SplitDonut data={toSplit(data.byColour)} />
              </ChartCard>
            </div>

            <p className="analytics-note">{data.note}</p>
          </div>
        );
      }}
    </DashboardState>
  );
}
