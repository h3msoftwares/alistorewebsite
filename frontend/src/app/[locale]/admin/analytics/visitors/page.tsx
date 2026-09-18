'use client';

import { useParams } from 'next/navigation';
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
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsVisitors(preset);

  return (
    <DashboardState query={query} isAr={isAr}>
      {(data) => {
        if (!data.configured) return <GaNotConnected what={t('The Visitors dashboard', 'لوحة الزوار')} isAr={isAr} />;

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
              <StatTile label={t('Visitors', 'الزوار')} value={num(totalUsers)} />
              <StatTile label={t('New users', 'مستخدمون جدد')} value={num(sum(traffic, 'newUsers'))} />
              <StatTile label={t('Sessions', 'الجلسات')} value={num(sum(traffic, 'sessions'))} />
              <StatTile label={t('Page views', 'مشاهدات الصفحة')} value={num(sum(traffic, 'screenPageViews'))} />
              <StatTile label={t('Avg engagement', 'متوسط التفاعل')} value={pct(avgEngagement)} />
            </StatGrid>

            <ChartCard title={t('Visitors & page views', 'الزوار ومشاهدات الصفحة')}>
              <TrendLine
                data={trend}
                series={[
                  { key: 'visitors', label: t('Visitors', 'الزوار') },
                  { key: 'pageviews', label: t('Page views', 'مشاهدات الصفحة') },
                ]}
              />
            </ChartCard>

            <div className="analytics-page__row">
              <ChartCard title={t('Devices', 'الأجهزة')}>
                <SplitDonut
                  data={Object.entries(devices).map(([label, value]) => ({ label, value }))}
                  isAr={isAr}
                />
              </ChartCard>
              <ChartCard title={t('Traffic sources', 'مصادر الزيارات')} height="auto">
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>{t('Channel', 'القناة')}</th>
                      <th>{t('Source / medium', 'المصدر / الوسيط')}</th>
                      <th className="is-numeric">{t('Sessions', 'الجلسات')}</th>
                      <th className="is-numeric">{t('Users', 'المستخدمون')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.sources ?? []).slice(0, 12).map((r) => (
                      <tr key={`${r.sessionDefaultChannelGroup}|${r.sessionSource}|${r.sessionMedium}`}>
                        <td data-label={t('Channel', 'القناة')}>{String(r.sessionDefaultChannelGroup || '—')}</td>
                        <td data-label={t('Source / medium', 'المصدر / الوسيط')}>
                          {String(r.sessionSource || '—')} / {String(r.sessionMedium || '—')}
                        </td>
                        <td data-label={t('Sessions', 'الجلسات')} className="is-numeric">{num(n(r, 'sessions'))}</td>
                        <td data-label={t('Users', 'المستخدمون')} className="is-numeric">{num(n(r, 'activeUsers'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </ChartCard>
            </div>

            <div className="analytics-page__row">
              <ChartCard title={t('Top pages', 'أفضل الصفحات')} height="auto">
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>{t('Path', 'المسار')}</th>
                      <th className="is-numeric">{t('Views', 'المشاهدات')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.pages ?? []).slice(0, 12).map((r) => (
                      <tr key={String(r.pagePath)}>
                        <td data-label={t('Path', 'المسار')}>{String(r.pagePath)}</td>
                        <td data-label={t('Views', 'المشاهدات')} className="is-numeric">{num(n(r, 'screenPageViews'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </ChartCard>
              <ChartCard title={t('Countries', 'الدول')} height="auto">
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>{t('Country', 'الدولة')}</th>
                      <th>{t('City', 'المدينة')}</th>
                      <th className="is-numeric">{t('Users', 'المستخدمون')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.geo ?? []).slice(0, 12).map((r) => (
                      <tr key={`${r.country}|${r.city}`}>
                        <td data-label={t('Country', 'الدولة')}>{String(r.country || '—')}</td>
                        <td data-label={t('City', 'المدينة')}>{String(r.city || '—')}</td>
                        <td data-label={t('Users', 'المستخدمون')} className="is-numeric">{num(n(r, 'activeUsers'))}</td>
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
