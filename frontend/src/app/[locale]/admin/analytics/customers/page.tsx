'use client';

import { DataTable } from '@/components/ui';
import {
  ChartCard,
  DashboardState,
  StatGrid,
  StatTile,
  TrendLine,
} from '@/components/admin/analytics';
import { money2, num, pct } from '@/components/admin/analytics/format';
import { useAnalyticsCustomers } from '@/hooks/use-analytics';
import { useAnalyticsRange } from '../range-context';

export default function AnalyticsCustomersPage() {
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsCustomers(preset);

  return (
    <DashboardState query={query}>
      {(data) => {
        const k = data.kpis;
        const series = data.newVsReturningSeries.map((p) => ({
          x: p.bucket.slice(0, 10),
          new: p.new_customers,
          returning: p.returning_orders,
        }));
        return (
          <div className="analytics-page">
            <StatGrid>
              <StatTile label="Customers with orders" value={num(k.customersWithOrders)} />
              <StatTile label="New (in range)" value={num(k.newCustomers)} />
              <StatTile label="Returning (in range)" value={num(k.returningCustomers)} />
              <StatTile label="Repeat purchase rate" value={pct(k.repeatPurchaseRate)} />
              <StatTile label="Orders / customer" value={k.ordersPerCustomer.toFixed(2)} />
              <StatTile label="Lifetime value" value={money2(k.lifetimeValue)} hint="all-time avg" />
              <StatTile
                label="Days between purchases"
                value={k.avgDaysBetweenPurchases == null ? '—' : k.avgDaysBetweenPurchases.toFixed(0)}
              />
            </StatGrid>

            <ChartCard title="New vs returning (orders per bucket)">
              <TrendLine
                data={series}
                series={[
                  { key: 'new', label: 'First orders' },
                  { key: 'returning', label: 'Repeat orders' },
                ]}
              />
            </ChartCard>

            <ChartCard title="Top customers by revenue (in range)" height="auto">
              {data.topCustomers.length === 0 ? (
                <p className="chart-card__empty">No customer orders in this range.</p>
              ) : (
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Email</th>
                      <th className="is-numeric">Orders</th>
                      <th className="is-numeric">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCustomers.map((c) => (
                      <tr key={c.id}>
                        <td data-label="Customer">{c.name}</td>
                        <td data-label="Email">{c.email}</td>
                        <td data-label="Orders" className="is-numeric">{c.orders}</td>
                        <td data-label="Revenue" className="is-numeric">{money2(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </ChartCard>

            <p className="analytics-note">{data.note}</p>
          </div>
        );
      }}
    </DashboardState>
  );
}
