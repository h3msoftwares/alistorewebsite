'use client';

import { useParams } from 'next/navigation';
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

export function AnalyticsCustomersPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsCustomers(preset);

  return (
    <DashboardState query={query} isAr={isAr}>
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
              <StatTile label={t('Customers with orders', 'عملاء لديهم طلبات')} value={num(k.customersWithOrders)} />
              <StatTile label={t('New (in range)', 'جدد (خلال الفترة)')} value={num(k.newCustomers)} />
              <StatTile label={t('Returning (in range)', 'عائدون (خلال الفترة)')} value={num(k.returningCustomers)} />
              <StatTile label={t('Repeat purchase rate', 'معدل تكرار الشراء')} value={pct(k.repeatPurchaseRate)} />
              <StatTile label={t('Orders / customer', 'طلبات / عميل')} value={k.ordersPerCustomer.toFixed(2)} />
              <StatTile label={t('Lifetime value', 'القيمة الدائمة')} value={money2(k.lifetimeValue)} hint={t('all-time avg', 'متوسط كل الأوقات')} />
              <StatTile
                label={t('Days between purchases', 'أيام بين عمليات الشراء')}
                value={k.avgDaysBetweenPurchases == null ? '—' : k.avgDaysBetweenPurchases.toFixed(0)}
              />
            </StatGrid>

            <ChartCard title={t('New vs returning (orders per bucket)', 'جدد مقابل عائدين (طلبات لكل فترة)')}>
              <TrendLine
                data={series}
                series={[
                  { key: 'new', label: t('First orders', 'الطلبات الأولى') },
                  { key: 'returning', label: t('Repeat orders', 'الطلبات المتكررة') },
                ]}
              />
            </ChartCard>

            <ChartCard title={t('Top customers by revenue (in range)', 'أفضل العملاء حسب الإيرادات (خلال الفترة)')} height="auto">
              {data.topCustomers.length === 0 ? (
                <p className="chart-card__empty">{t('No customer orders in this range.', 'لا طلبات عملاء في هذه الفترة.')}</p>
              ) : (
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>{t('Customer', 'العميل')}</th>
                      <th>{t('Email', 'البريد الإلكتروني')}</th>
                      <th className="is-numeric">{t('Orders', 'الطلبات')}</th>
                      <th className="is-numeric">{t('Revenue', 'الإيرادات')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCustomers.map((c) => (
                      <tr key={c.id}>
                        <td data-label={t('Customer', 'العميل')}>{c.name}</td>
                        <td data-label={t('Email', 'البريد الإلكتروني')}>{c.email}</td>
                        <td data-label={t('Orders', 'الطلبات')} className="is-numeric">{c.orders}</td>
                        <td data-label={t('Revenue', 'الإيرادات')} className="is-numeric">{money2(c.revenue)}</td>
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
