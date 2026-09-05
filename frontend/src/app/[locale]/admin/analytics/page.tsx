'use client';

import {
  ChartCard,
  DashboardState,
  FunnelSteps,
  GaNotConnected,
  StatGrid,
  StatTile,
  TrendLine,
} from '@/components/admin/analytics';
import { bucketLabel, money, money2, num } from '@/components/admin/analytics/format';
import { useAnalyticsOverview } from '@/hooks/use-analytics';
import { useAnalyticsRange } from './range-context';

export default function AnalyticsOverviewPage() {
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsOverview(preset);

  return (
    <DashboardState query={query}>
      {(data) => {
        const k = data.kpis;
        const series = data.revenueSeries.map((p) => ({
          x: bucketLabel(p.bucket),
          revenue: p.revenue,
          orders: p.orders,
        }));
        return (
          <div className="analytics-page">
            <StatGrid>
              <StatTile label="Revenue" value={money(k.revenue)} hint={`${money2(k.deliveredRevenue)} delivered`} />
              <StatTile label="Orders" value={num(k.orders)} hint={`${k.itemsPerOrder.toFixed(1)} items / order`} />
              <StatTile label="Avg order value" value={money2(k.averageOrderValue)} />
              <StatTile label="Units sold" value={num(k.unitsSold)} />
              <StatTile label="New customers" value={num(k.newCustomers)} />
              <StatTile label="Returning customers" value={num(k.returningCustomers)} />
              <StatTile label="Low-stock variants" value={num(k.lowStockVariants)} />
            </StatGrid>

            <ChartCard title="Revenue & orders" subtitle="Gross, excludes cancelled">
              <TrendLine
                data={series}
                series={[
                  { key: 'revenue', label: 'Revenue' },
                  { key: 'orders', label: 'Orders' },
                ]}
                formatY={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
            </ChartCard>

            <ChartCard title="Conversion funnel" subtitle="From Google Analytics 4" height="auto">
              {data.funnel.configured ? (
                <FunnelSteps steps={data.funnel.steps} />
              ) : (
                <GaNotConnected what="The funnel" />
              )}
            </ChartCard>

            <p className="analytics-note">{data.note}</p>
            <p className="analytics-note">
              Promotions, returns/refunds, shipping revenue and non-COD payment analytics are
              omitted — those features don&apos;t exist yet.
            </p>
          </div>
        );
      }}
    </DashboardState>
  );
}
