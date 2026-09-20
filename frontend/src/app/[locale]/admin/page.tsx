'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, DataTable, EmptyState, ProductGridSkeleton, StatusPill } from '@/components/ui';
import { ChartCard, StatGrid, TrendLine } from '@/components/admin/analytics';
import { bucketLabel } from '@/components/admin/analytics/format';
import { useAdminDashboard } from '@/hooks/use-orders';
import { useAnalyticsOverview } from '@/hooks/use-analytics';
import { NotificationBell } from '@/components/admin/notification-bell';

/** Admin landing page: an at-a-glance "what needs attention" view. The
 *  date-ranged deep dives live under /admin/analytics — this page is the
 *  operational hub (open work + shortcuts), not another analytics report. */
export default function AdminDashboardPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const base = `/${locale}/admin`;

  const money = (n: number) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', {
      style: 'currency',
      currency: 'USD',
      numberingSystem: 'latn',
    }).format(n);
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const { data, isPending, isError, refetch } = useAdminDashboard();
  // Last-30-days revenue & orders trend — reuses the analytics overview report.
  const trend = useAnalyticsOverview('30d');
  const trendSeries = (trend.data?.revenueSeries ?? []).map((p) => ({
    x: bucketLabel(p.bucket),
    revenue: p.revenue,
    orders: p.orders,
  }));

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Dashboard', 'لوحة التحكم')}</h1>
        <NotificationBell locale={locale} />
      </div>

      {isPending ? (
        <ProductGridSkeleton count={4} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load the dashboard", 'تعذّر تحميل لوحة التحكم')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : (
        <div className="admin-dashboard">
          <StatGrid>
            <Link className="stat-tile stat-tile--link" href={`${base}/orders?status=PENDING`}>
              <span className="stat-tile__label">{t('Pending orders', 'طلبات قيد الانتظار')}</span>
              <span className="stat-tile__value">{data.pendingOrders}</span>
              <span className="stat-tile__hint">
                {t(`of ${data.totalOrders} total`, `من ${data.totalOrders} إجمالاً`)}
              </span>
            </Link>

            <Link className="stat-tile stat-tile--link" href={`${base}/orders?status=CONFIRMED,SHIPPED`}>
              <span className="stat-tile__label">{t('Confirmed, not delivered', 'مؤكَّدة، لم تُسلَّم')}</span>
              <span className="stat-tile__value">{data.confirmedNotDelivered}</span>
              <span className="stat-tile__hint">{t('confirmed or shipped', 'مؤكَّدة أو تم شحنها')}</span>
            </Link>

            <Link className="stat-tile stat-tile--link" href={`${base}/orders?flagged=true`}>
              <span className="stat-tile__label">{t('Flagged for review', 'معلَّمة للمراجعة')}</span>
              <span className="stat-tile__value">{data.flaggedOrders}</span>
              <span className="stat-tile__hint">{t('anti-abuse velocity flags', 'إشارات كثرة الطلبات')}</span>
            </Link>

            <Link className="stat-tile stat-tile--link" href={`${base}/orders?awaitingCod=true`}>
              <span className="stat-tile__label">{t('Awaiting COD', 'بانتظار تحصيل الدفع')}</span>
              <span className="stat-tile__value">{data.awaitingCodCollection}</span>
              <span className="stat-tile__hint">{t('delivered, not collected', 'تم التسليم دون تحصيل')}</span>
            </Link>

            <Link className="stat-tile stat-tile--link" href={`${base}/analytics/inventory`}>
              <span className="stat-tile__label">{t('Low / out of stock', 'مخزون منخفض / نافد')}</span>
              <span className="stat-tile__value">{data.lowStockVariants + data.outOfStockVariants}</span>
              <span className="stat-tile__hint">
                {t(`${data.outOfStockVariants} out of stock`, `${data.outOfStockVariants} نافد`)}
              </span>
            </Link>
          </StatGrid>

          {trendSeries.length > 0 && (
            <ChartCard
              title={t('Revenue & orders', 'الإيرادات والطلبات')}
              subtitle={t('Last 30 days · gross, excludes cancelled', 'آخر 30 يومًا · إجمالي، باستثناء الملغاة')}
            >
              <TrendLine
                data={trendSeries}
                series={[
                  { key: 'revenue', label: t('Revenue', 'الإيرادات') },
                  { key: 'orders', label: t('Orders', 'الطلبات') },
                ]}
                formatY={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
            </ChartCard>
          )}

          <div className="admin-dashboard__quick">
            <span className="admin-dashboard__quick-label">{t('Quick actions', 'إجراءات سريعة')}</span>
            <Link className="btn btn--outline btn--sm" href={`${base}/products/new`}>
              {t('New product', 'منتج جديد')}
            </Link>
            <Link className="btn btn--outline btn--sm" href={`${base}/collections/new`}>
              {t('New collection', 'مجموعة جديدة')}
            </Link>
            <Link className="btn btn--outline btn--sm" href={`${base}/settings`}>
              {t('Settings', 'الإعدادات')}
            </Link>
          </div>

          <section>
            <div className="admin-page__head">
              <h2 className="admin-dashboard__section-title">{t('Out of stock', 'نفدت الكمية')}</h2>
              <Link className="admin-dashboard__see-all" href={`${base}/analytics/inventory`}>
                {t('See all', 'عرض الكل')}
              </Link>
            </div>

            {data.outOfStockItems.length === 0 ? (
              <EmptyState title={t('Everything is in stock', 'كل شيء متوفر')} />
            ) : (
              <DataTable responsive>
                <thead>
                  <tr>
                    <th>{t('Product', 'المنتج')}</th>
                    <th>{t('Variant', 'الخيار')}</th>
                    <th>{t('SKU', 'رمز المنتج')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.outOfStockItems.map((item) => (
                    <tr key={item.sku}>
                      <td data-label={t('Product', 'المنتج')}>
                        <Link href={`${base}/products/${item.productId}`}>{isAr ? item.nameAr : item.nameEn}</Link>
                      </td>
                      <td data-label={t('Variant', 'الخيار')}>
                        {[item.size, item.color].filter(Boolean).join(' / ') || t('One size', 'مقاس واحد')}
                      </td>
                      <td data-label={t('SKU', 'رمز المنتج')}>{item.sku}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>

          <section>
            <div className="admin-page__head">
              <h2 className="admin-dashboard__section-title">{t('Recent orders', 'أحدث الطلبات')}</h2>
              <Link className="admin-dashboard__see-all" href={`${base}/orders`}>
                {t('See all', 'عرض الكل')}
              </Link>
            </div>

            {data.recentOrders.length === 0 ? (
              <EmptyState title={t('No orders yet', 'لا توجد طلبات بعد')} />
            ) : (
              <DataTable responsive>
                <thead>
                  <tr>
                    <th>{t('Order', 'الطلب')}</th>
                    <th>{t('Customer', 'الزبون')}</th>
                    <th>{t('Date', 'التاريخ')}</th>
                    <th className="is-numeric">{t('Total', 'الإجمالي')}</th>
                    <th>{t('Status', 'الحالة')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td data-label={t('Order', 'الطلب')}>
                        <Link href={`${base}/orders`}>{o.orderNumber}</Link>
                      </td>
                      <td data-label={t('Customer', 'الزبون')}>{o.deliveryName}</td>
                      <td data-label={t('Date', 'التاريخ')}>{date(o.dateCreated)}</td>
                      <td className="is-numeric" data-label={t('Total', 'الإجمالي')}>
                        {money(Number(o.total))}
                        {Number(o.discountAmount ?? 0) > 0 && (
                          <span className="admin-order-discount">
                            −{money(Number(o.discountAmount))}
                            {o.couponCode ? ` · ${o.couponCode}` : ''}
                          </span>
                        )}
                      </td>
                      <td data-label={t('Status', 'الحالة')}>
                        <StatusPill status={o.status} locale={locale} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
