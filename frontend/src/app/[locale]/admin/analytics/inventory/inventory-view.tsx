'use client';

import { useParams } from 'next/navigation';
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
import { colorLabel } from '@/lib/product-variants';
import type { Breakdown } from '@/lib/types';
import { useAnalyticsRange } from '../range-context';

const toBars = (rows: Breakdown[]) => rows.slice(0, 8).map((r) => ({ label: r.label, value: r.units }));
const variantLabel = (r: { size: string | null; color: string | null }, isAr: boolean) =>
  [r.size, r.color ? colorLabel(r.color, isAr ? 'ar' : 'en') : null].filter(Boolean).join(' / ') ||
  (isAr ? 'مقاس واحد' : 'one size');

const STOCK_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  INITIAL: { en: 'Initial', ar: 'أولي' },
  PURCHASE: { en: 'Purchase', ar: 'شراء' },
  SALE: { en: 'Sale', ar: 'بيع' },
  ADJUSTMENT: { en: 'Adjustment', ar: 'تعديل' },
  RETURN: { en: 'Return', ar: 'إرجاع' },
  RESTOCK: { en: 'Restock', ar: 'إعادة تخزين' },
};

export function AnalyticsInventoryPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { preset } = useAnalyticsRange();
  const query = useAnalyticsInventory(preset);

  return (
    <DashboardState query={query} isAr={isAr}>
      {(data) => {
        const k = data.kpis;
        return (
          <div className="analytics-page">
            <StatGrid>
              <StatTile label={t('Stock on hand', 'المخزون المتوفر')} value={num(k.stockUnits)} hint={t(`${money(k.stockValue)} at cost price`, `${money(k.stockValue)} بسعر التكلفة`)} />
              <StatTile label={t('Units sold (in range)', 'الوحدات المباعة (خلال الفترة)')} value={num(k.unitsSold)} />
              <StatTile label={t('Sell-through', 'معدل البيع')} value={pct(k.sellThroughRate)} />
              <StatTile label={t('Low-stock variants', 'خيارات منخفضة المخزون')} value={num(k.lowStockCount)} />
              <StatTile label={t('Out of stock', 'نفدت الكمية')} value={num(k.outOfStockCount)} />
            </StatGrid>

            <div className="analytics-page__row">
              <ChartCard title={t('Best-selling sizes', 'أفضل المقاسات مبيعًا')}>
                <BreakdownBars data={toBars(data.bestSellingSizes)} isAr={isAr} />
              </ChartCard>
              <ChartCard title={t('Best-selling colours', 'أفضل الألوان مبيعًا')}>
                <BreakdownBars data={toBars(data.bestSellingColours)} isAr={isAr} />
              </ChartCard>
            </div>

            <ChartCard title={t('Low stock', 'مخزون منخفض')} height="auto">
              {data.lowStock.length === 0 ? (
                <p className="chart-card__empty">{t('Nothing below the threshold.', 'لا شيء دون الحد الأدنى.')}</p>
              ) : (
                <DataTable responsive>
                  <thead>
                    <tr>
                      <th>{t('Product', 'المنتج')}</th>
                      <th>{t('Variant', 'الخيار')}</th>
                      <th>{t('SKU', 'رمز المنتج')}</th>
                      <th className="is-numeric">{t('Units', 'الوحدات')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lowStock.map((r) => (
                      <tr key={r.sku}>
                        <td data-label={t('Product', 'المنتج')}>{r.product}</td>
                        <td data-label={t('Variant', 'الخيار')}>{variantLabel(r, isAr)}</td>
                        <td data-label={t('SKU', 'رمز المنتج')}>{r.sku}</td>
                        <td data-label={t('Units', 'الوحدات')} className="is-numeric">{r.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              )}
            </ChartCard>

            <div className="analytics-page__row">
              <ChartCard title={t('Out of stock', 'نفدت الكمية')} height="auto">
                {data.outOfStock.length === 0 ? (
                  <p className="chart-card__empty">{t('Everything is in stock.', 'كل شيء متوفر.')}</p>
                ) : (
                  <ul className="analytics-list">
                    {data.outOfStock.map((r) => (
                      <li key={r.sku}>
                        {r.product} <span className="analytics-list__meta">{variantLabel(r, isAr)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </ChartCard>
              <ChartCard title={t('Slow movers (no sales in range)', 'الأبطأ حركة (بلا مبيعات خلال الفترة)')} height="auto">
                {data.slowMovers.length === 0 ? (
                  <p className="chart-card__empty">{t('Every active product sold at least once.', 'كل منتج مفعّل بيع مرة واحدة على الأقل.')}</p>
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

            <ChartCard title={t('Recent stock movements', 'حركات المخزون الأخيرة')} height="auto">
              <DataTable responsive>
                <thead>
                  <tr>
                    <th>{t('When', 'متى')}</th>
                    <th>{t('Product', 'المنتج')}</th>
                    <th>{t('SKU', 'رمز المنتج')}</th>
                    <th>{t('Type', 'النوع')}</th>
                    <th className="is-numeric">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentMovements.map((m) => (
                    <tr key={m.id}>
                      <td data-label={t('When', 'متى')}>{new Date(m.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}</td>
                      <td data-label={t('Product', 'المنتج')}>{m.variant.product.nameEn}</td>
                      <td data-label={t('SKU', 'رمز المنتج')}>{m.variant.sku}</td>
                      <td data-label={t('Type', 'النوع')}>
                        {STOCK_TYPE_LABELS[m.type] ? t(STOCK_TYPE_LABELS[m.type].en, STOCK_TYPE_LABELS[m.type].ar) : m.type}
                      </td>
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
