'use client';

import { DataTable } from '@/components/ui';
import {
  BreakdownBars,
  ChartCard,
  DashboardState,
  StatGrid,
  StatTile,
} from '@/components/admin/analytics';
import { money, num, pct } from '@/components/admin/analytics/format';
import { useAnalyticsInventory } from '@/hooks/use-analytics';
import type { Breakdown } from '@/lib/types';
import { useAnalyticsRange } from '../range-context';

const toBars = (rows: Breakdown[]) => rows.slice(0, 8).map((r) => ({ label: r.label, value: r.units }));
const variantLabel = (r: { size: string | null; color: string | null }) =>
  [r.size, r.color].filter(Boolean).join(' / ') || 'one size';

export default function AnalyticsInventoryPage() {
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsInventory(preset);

  return (
    <DashboardState query={query}>
      {(data) => {
        const k = data.kpis;
        return (
          <div className="analytics-page">
            <StatGrid>
              <StatTile label="Stock on hand" value={num(k.stockUnits)} hint={`${money(k.stockValue)} at cost price`} />
              <StatTile label="Units sold (in range)" value={num(k.unitsSold)} />
              <StatTile label="Sell-through" value={pct(k.sellThroughRate)} />
              <StatTile label="Low-stock variants" value={num(k.lowStockCount)} />
              <StatTile label="Out of stock" value={num(k.outOfStockCount)} />
            </StatGrid>

            <div className="analytics-page__row">
              <ChartCard title="Best-selling sizes">
                <BreakdownBars data={toBars(data.bestSellingSizes)} />
              </ChartCard>
              <ChartCard title="Best-selling colours">
                <BreakdownBars data={toBars(data.bestSellingColours)} />
              </ChartCard>
            </div>

            <ChartCard title="Low stock" height="auto">
              {data.lowStock.length === 0 ? (
                <p className="chart-card__empty">Nothing below the threshold.</p>
              ) : (
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th>SKU</th>
                      <th className="is-numeric">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lowStock.map((r) => (
                      <tr key={r.sku}>
                        <td data-label="Product">{r.product}</td>
                        <td data-label="Variant">{variantLabel(r)}</td>
                        <td data-label="SKU">{r.sku}</td>
                        <td data-label="Units" className="is-numeric">{r.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </ChartCard>

            <div className="analytics-page__row">
              <ChartCard title="Out of stock" height="auto">
                {data.outOfStock.length === 0 ? (
                  <p className="chart-card__empty">Everything is in stock.</p>
                ) : (
                  <ul className="analytics-list">
                    {data.outOfStock.map((r) => (
                      <li key={r.sku}>
                        {r.product} <span className="analytics-list__meta">{variantLabel(r)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
              <ChartCard title="Slow movers (no sales in range)" height="auto">
                {data.slowMovers.length === 0 ? (
                  <p className="chart-card__empty">Every active product sold at least once.</p>
                ) : (
                  <ul className="analytics-list">
                    {data.slowMovers.map((r) => (
                      <li key={r.sku}>
                        {r.product} <span className="analytics-list__meta">{r.sku}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
            </div>

            <ChartCard title="Recent stock movements" height="auto">
              <DataTable responsive>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Type</th>
                    <th className="is-numeric">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentMovements.map((m) => (
                    <tr key={m.id}>
                      <td data-label="When">{new Date(m.createdAt).toLocaleDateString('en-US')}</td>
                      <td data-label="Product">{m.variant.product.nameEn}</td>
                      <td data-label="SKU">{m.variant.sku}</td>
                      <td data-label="Type">{m.type}</td>
                      <td data-label="Δ" className="is-numeric">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </ChartCard>

            <p className="analytics-note">{data.note}</p>
          </div>
        );
      }}
    </DashboardState>
  );
}
