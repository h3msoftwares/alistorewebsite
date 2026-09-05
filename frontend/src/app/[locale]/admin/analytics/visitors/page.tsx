'use client';

import { DataTable } from '@/components/ui';
import {
  ChartCard,
  DashboardState,
  GaNotConnected,
  SplitDonut,
  StatGrid,
  StatTile,
  TrendLine,
} from '@/components/admin/analytics';
import { num, pct } from '@/components/admin/analytics/format';
import { useAnalyticsVisitors } from '@/hooks/use-analytics';
import type { GaRow } from '@/lib/types';
import { useAnalyticsRange } from '../range-context';

const n = (row: GaRow, key: string) => Number(row[key] ?? 0);
const gaDate = (d: string) => `${d.slice(4, 6)}/${d.slice(6, 8)}`;
const sum = (rows: GaRow[], key: string) => rows.reduce((t, r) => t + n(r, key), 0);

export default function AnalyticsVisitorsPage() {
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsVisitors(preset);

  return (
    <DashboardState query={query}>
      {(data) => {
        if (!data.configured) return <GaNotConnected what="The Visitors dashboard" />;

        const traffic = data.traffic ?? [];
        const trend = traffic.map((r) => ({
          x: gaDate(String(r.date)),
          visitors: n(r, 'activeUsers'),
          pageviews: n(r, 'screenPageViews'),
        }));
        const totalUsers = sum(traffic, 'activeUsers');
        const avgEngagement = traffic.length
          ? traffic.reduce((t, r) => t + n(r, 'engagementRate'), 0) / traffic.length
          : 0;
        const devices = (data.devices ?? []).reduce<Record<string, number>>((acc, r) => {
          const key = String(r.deviceCategory || 'unknown');
          acc[key] = (acc[key] ?? 0) + n(r, 'activeUsers');
          return acc;
        }, {});

        return (
          <div className="analytics-page">
            <StatGrid>
              <StatTile label="Visitors" value={num(totalUsers)} />
              <StatTile label="New users" value={num(sum(traffic, 'newUsers'))} />
              <StatTile label="Sessions" value={num(sum(traffic, 'sessions'))} />
              <StatTile label="Page views" value={num(sum(traffic, 'screenPageViews'))} />
              <StatTile label="Avg engagement" value={pct(avgEngagement)} />
            </StatGrid>

            <ChartCard title="Visitors & page views">
              <TrendLine
                data={trend}
                series={[
                  { key: 'visitors', label: 'Visitors' },
                  { key: 'pageviews', label: 'Page views' },
                ]}
              />
            </ChartCard>

            <div className="analytics-page__row">
              <ChartCard title="Devices">
                <SplitDonut
                  data={Object.entries(devices).map(([label, value]) => ({ label, value }))}
                />
              </ChartCard>
              <ChartCard title="Traffic sources" height="auto">
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Source / medium</th>
                      <th className="is-numeric">Sessions</th>
                      <th className="is-numeric">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.sources ?? []).slice(0, 12).map((r, i) => (
                      <tr key={i}>
                        <td data-label="Channel">{String(r.sessionDefaultChannelGroup || '—')}</td>
                        <td data-label="Source / medium">
                          {String(r.sessionSource || '—')} / {String(r.sessionMedium || '—')}
                        </td>
                        <td data-label="Sessions" className="is-numeric">{num(n(r, 'sessions'))}</td>
                        <td data-label="Users" className="is-numeric">{num(n(r, 'activeUsers'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </ChartCard>
            </div>

            <div className="analytics-page__row">
              <ChartCard title="Top pages" height="auto">
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th className="is-numeric">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.pages ?? []).slice(0, 12).map((r, i) => (
                      <tr key={i}>
                        <td data-label="Path">{String(r.pagePath)}</td>
                        <td data-label="Views" className="is-numeric">{num(n(r, 'screenPageViews'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </ChartCard>
              <ChartCard title="Countries" height="auto">
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th>City</th>
                      <th className="is-numeric">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.geo ?? []).slice(0, 12).map((r, i) => (
                      <tr key={i}>
                        <td data-label="Country">{String(r.country || '—')}</td>
                        <td data-label="City">{String(r.city || '—')}</td>
                        <td data-label="Users" className="is-numeric">{num(n(r, 'activeUsers'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </ChartCard>
            </div>
          </div>
        );
      }}
    </DashboardState>
  );
}
