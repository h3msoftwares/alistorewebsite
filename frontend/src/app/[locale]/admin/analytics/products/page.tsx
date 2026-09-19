'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DataTable } from '@/components/ui';
import { AdminPager } from '@/components/admin/admin-pager';
import { ChartCard, DashboardState, GaNotConnected } from '@/components/admin/analytics';
import { money2, num, pct } from '@/components/admin/analytics/format';
import { useAnalyticsProducts } from '@/hooks/use-analytics';
import { useAnalyticsRange } from '../range-context';

const PAGE_SIZE = 25;

export default function AnalyticsProductsPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsProducts(preset);
  const [page, setPage] = useState(1);

  return (
    <DashboardState query={query} isAr={isAr}>
      {(data) => {
        const totalPages = Math.max(1, Math.ceil(data.products.length / PAGE_SIZE));
        const pageProducts = data.products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

        return (
          <div className="analytics-page">
            {!data.ga.configured && <GaNotConnected what={t('Product view counts', 'عدد مشاهدات المنتج')} isAr={isAr} />}

            <ChartCard title={t('Product performance', 'أداء المنتجات')} subtitle={t('Ranked by revenue — click a product to open it', 'مرتّبة حسب الإيرادات — اضغط على منتج لفتحه')} height="auto">
              {data.products.length === 0 ? (
                <p className="chart-card__empty">{t('No sales in this range.', 'لا مبيعات في هذه الفترة.')}</p>
              ) : (
                <>
                  <DataTable responsive>
                    <thead>
                      <tr>
                        <th>{t('Product', 'المنتج')}</th>
                        <th>{t('SKU', 'رمز المنتج')}</th>
                        <th className="is-numeric">{t('Units', 'الوحدات')}</th>
                        <th className="is-numeric">{t('Revenue', 'الإيرادات')}</th>
                        <th className="is-numeric">{t('Orders', 'الطلبات')}</th>
                        <th className="is-numeric">{t('Buyers', 'المشترون')}</th>
                        <th className="is-numeric">{t('Views', 'المشاهدات')}</th>
                        <th className="is-numeric">{t('View→buy', 'مشاهدة←شراء')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageProducts.map((p) => (
                        <tr key={p.sku}>
                          <td data-label={t('Product', 'المنتج')}>
                            <Link href={`/${locale}/admin/products/${p.productId}`}>{p.name}</Link>
                          </td>
                          <td data-label={t('SKU', 'رمز المنتج')}>{p.sku}</td>
                          <td data-label={t('Units', 'الوحدات')} className="is-numeric">{num(p.units)}</td>
                          <td data-label={t('Revenue', 'الإيرادات')} className="is-numeric">{money2(p.revenue)}</td>
                          <td data-label={t('Orders', 'الطلبات')} className="is-numeric">{num(p.orders)}</td>
                          <td data-label={t('Buyers', 'المشترون')} className="is-numeric">{num(p.buyers)}</td>
                          <td data-label={t('Views', 'المشاهدات')} className="is-numeric">{p.views == null ? '—' : num(p.views)}</td>
                          <td data-label={t('View→buy', 'مشاهدة←شراء')} className="is-numeric">{pct(p.viewToPurchaseRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                  <AdminPager page={page} totalPages={totalPages} onPageChange={setPage} locale={locale} />
                </>
              )}
            </ChartCard>

            <p className="analytics-note">{data.note}</p>
          </div>
        );
      }}
    </DashboardState>
  );
}
