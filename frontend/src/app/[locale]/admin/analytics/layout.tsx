'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Select } from '@/components/ui';
import { PRESETS, type AnalyticsPreset } from '@/lib/api/analytics';
import { AnalyticsRangeProvider, useAnalyticsRange } from './range-context';

const TABS = [
  { href: '', en: 'Overview', ar: 'نظرة عامة' },
  { href: '/visitors', en: 'Visitors', ar: 'الزوار' },
  { href: '/products', en: 'Products', ar: 'المنتجات' },
  { href: '/sales', en: 'Sales', ar: 'المبيعات' },
  { href: '/customers', en: 'Customers', ar: 'العملاء' },
  { href: '/inventory', en: 'Inventory', ar: 'المخزون' },
];

const PRESET_LABELS: Record<AnalyticsPreset, { en: string; ar: string }> = {
  '7d': { en: 'Last 7 days', ar: 'آخر 7 أيام' },
  '30d': { en: 'Last 30 days', ar: 'آخر 30 يومًا' },
  '90d': { en: 'Last 90 days', ar: 'آخر 90 يومًا' },
  '12mo': { en: 'Last 12 months', ar: 'آخر 12 شهرًا' },
};

function Bar({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const pathname = usePathname();
  const { preset, setPreset } = useAnalyticsRange();
  const base = `/${locale}/admin/analytics`;

  return (
    <div className="analytics-bar">
      <nav className="analytics-tabs" aria-label={isAr ? 'أقسام التحليلات' : 'Analytics sections'}>
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const active = tab.href === '' ? pathname === base : pathname === href;
          return (
            <Link key={tab.href} href={href} className="analytics-tabs__link" data-active={active || undefined}>
              {isAr ? tab.ar : tab.en}
            </Link>
          );
        })}
      </nav>
      <label className="analytics-bar__range">
        <span className="visually-hidden">{isAr ? 'النطاق الزمني' : 'Date range'}</span>
        <Select value={preset} onChange={(e) => setPreset(e.target.value as AnalyticsPreset)}>
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {isAr ? PRESET_LABELS[p.value].ar : PRESET_LABELS[p.value].en}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';

  return (
    <AnalyticsRangeProvider>
      <div className="section--tight">
        <div className="admin-page__head">
          <h1>{locale === 'ar' ? 'التحليلات' : 'Analytics'}</h1>
        </div>
        <Bar locale={locale} />
        {children}
      </div>
    </AnalyticsRangeProvider>
  );
}
