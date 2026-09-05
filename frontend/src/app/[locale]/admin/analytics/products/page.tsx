'use client';

import { DataTable } from '@/components/ui';
import { ChartCard, DashboardState, GaNotConnected } from '@/components/admin/analytics';
import { money2, num, pct } from '@/components/admin/analytics/format';
import { useAnalyticsProducts } from '@/hooks/use-analytics';
import { useAnalyticsRange } from '../range-context';

export default function AnalyticsProductsPage() {
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsProducts(preset);

  return (
    <DashboardState query={query}>
      {(data) => (
        <div className="analytics-page">
          {!data.ga.configured && <GaNotConnected what="Product view counts" />}

          <ChartCard title="Product performance" subtitle="Ranked by revenue" height="auto">
            {data.products.length === 0 ? (
              <p className="chart-card__empty">No sales in this range.</p>
            ) : (
              <DataTable responsive>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th className="is-numeric">Units</th>
                    <th className="is-numeric">Revenue</th>
                    <th className="is-numeric">Orders</th>
                    <th className="is-numeric">Buyers</th>
                    <th className="is-numeric">Views</th>
                    <th className="is-numeric">View→buy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p) => (
                    <tr key={p.sku}>
                      <td data-label="Product">{p.name}</td>
                      <td data-label="SKU">{p.sku}</td>
                      <td data-label="Units" className="is-numeric">{num(p.units)}</td>
                      <td data-label="Revenue" className="is-numeric">{money2(p.revenue)}</td>
                      <td data-label="Orders" className="is-numeric">{num(p.orders)}</td>
                      <td data-label="Buyers" className="is-numeric">{num(p.buyers)}</td>
                      <td data-label="Views" className="is-numeric">{p.views == null ? '—' : num(p.views)}</td>
                      <td data-label="View→buy" className="is-numeric">{pct(p.viewToPurchaseRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </ChartCard>

          <p className="analytics-note">{data.note}</p>
        </div>
      )}
    </DashboardState>
  );
}
