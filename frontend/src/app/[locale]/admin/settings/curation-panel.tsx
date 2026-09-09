'use client';

import { useState } from 'react';
import { Alert, Choice, DataTable, Input, ProductGridSkeleton } from '@/components/ui';
import {
  useAdminCategories,
  useAdminCollections,
  useUpdateCategory,
  useUpdateCollection,
} from '@/hooks/use-catalog';
import { useSettings, useUpdateSettings } from '@/hooks/use-settings';
import type { HomeShowcase, ShowcaseType } from '@/lib/types';

const SHOWCASE_ORDER: ShowcaseType[] = ['BEST_SELLERS', 'NEW_ARRIVALS', 'ON_SALE'];
const SHOWCASE_LABEL: Record<ShowcaseType, { en: string; ar: string }> = {
  BEST_SELLERS: { en: 'Best sellers', ar: 'الأكثر مبيعًا' },
  NEW_ARRIVALS: { en: 'New arrivals', ar: 'وصل حديثًا' },
  ON_SALE: { en: 'On sale', ar: 'التخفيضات' },
};

/**
 * Quick-edit grid for what shows in the nav and on the home page, without
 * opening each collection / category. Every toggle / sort-order change fires
 * the same update mutation the per-record forms use; the storefront nav +
 * home rows re-derive from the invalidated list.
 */
export function CurationPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const collections = useAdminCollections({ status: 'all' });
  const categories = useAdminCategories({ status: 'all' });
  const { data: settings } = useSettings();
  const updateCollection = useUpdateCollection();
  const updateCategory = useUpdateCategory();
  const updateSettings = useUpdateSettings();
  const [error, setError] = useState<string | null>(null);

  // The 3 built-in smart rows, always in a fixed order — merge whatever the
  // API returned onto the defaults so an un-seeded type still shows a row.
  const showcaseByType = new Map((settings?.showcases ?? []).map((s) => [s.type, s]));
  const showcases: HomeShowcase[] = SHOWCASE_ORDER.map(
    (type) =>
      showcaseByType.get(type) ?? { type, isActive: false, sortOrder: 0, labelEn: null, labelAr: null }
  );

  const patchShowcase = (type: ShowcaseType, change: Partial<HomeShowcase>) => {
    setError(null);
    const next = showcases.map((s) => (s.type === type ? { ...s, ...change } : s));
    updateSettings.mutate(
      {
        showcases: next.map((s) => ({
          type: s.type,
          isActive: s.isActive,
          sortOrder: s.sortOrder,
          labelEn: s.labelEn ?? '',
          labelAr: s.labelAr ?? '',
        })),
      },
      { onError: (e) => setError(e instanceof Error ? e.message : t('Update failed', 'فشل التحديث')) }
    );
  };

  const patchCollection = (id: string, body: Record<string, unknown>) => {
    setError(null);
    updateCollection.mutate(
      { id, body },
      { onError: (e) => setError(e instanceof Error ? e.message : t('Update failed', 'فشل التحديث')) }
    );
  };
  const patchCategory = (id: string, body: Record<string, unknown>) => {
    setError(null);
    updateCategory.mutate(
      { id, body },
      { onError: (e) => setError(e instanceof Error ? e.message : t('Update failed', 'فشل التحديث')) }
    );
  };

  return (
    <section className="admin-form">
      <p className="admin-form__section-title">{t('Navigation & home page', 'التنقل والصفحة الرئيسية')}</p>
      <p className="admin-form__hint">
        {t(
          'Choose which collections appear in the top nav and which collections & categories are featured on the home page. Lower sort order shows first.',
          'اختر المجموعات التي تظهر في شريط التنقل، والمجموعات والفئات المميزة في الصفحة الرئيسية. الأصغر ترتيبًا يظهر أولًا.'
        )}
      </p>

      {error && <Alert tone="danger">{error}</Alert>}

      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-4)' }}>
        {t('Smart home rows', 'صفوف الرئيسية الذكية')}
      </p>
      <p className="admin-form__hint">
        {t(
          'Built-in product rows you can switch on without creating a category. Sort order slots them among the featured collections & categories above.',
          'صفوف منتجات جاهزة يمكنك تفعيلها دون إنشاء فئة. يحدد الترتيب موضعها بين المجموعات والفئات المميزة.'
        )}
      </p>
      <DataTable responsive>
        <thead>
          <tr>
            <th>{t('Row', 'الصف')}</th>
            <th>{t('On home', 'في الرئيسية')}</th>
            <th>{t('Sort', 'الترتيب')}</th>
            <th>{t('Label (English)', 'التسمية (إنجليزي)')}</th>
            <th>{t('Label (Arabic)', 'التسمية (عربي)')}</th>
          </tr>
        </thead>
        <tbody>
          {showcases.map((s) => (
            <tr key={s.type}>
              <td data-label={t('Row', 'الصف')}>
                {isAr ? SHOWCASE_LABEL[s.type].ar : SHOWCASE_LABEL[s.type].en}
              </td>
              <td data-label={t('On home', 'في الرئيسية')}>
                <Choice
                  type="checkbox"
                  label={<span className="visually-hidden">{t('On home', 'في الرئيسية')}</span>}
                  checked={s.isActive}
                  onChange={(e) => patchShowcase(s.type, { isActive: e.target.checked })}
                />
              </td>
              <td data-label={t('Sort', 'الترتيب')}>
                <Input
                  type="number"
                  min={0}
                  defaultValue={s.sortOrder}
                  aria-label={t('Sort order', 'ترتيب العرض')}
                  style={{ width: '4.5rem' }}
                  onBlur={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isInteger(next) && next >= 0 && next !== s.sortOrder) {
                      patchShowcase(s.type, { sortOrder: next });
                    }
                  }}
                />
              </td>
              <td data-label={t('Label (English)', 'التسمية (إنجليزي)')}>
                <Input
                  defaultValue={s.labelEn ?? ''}
                  placeholder={SHOWCASE_LABEL[s.type].en}
                  aria-label={t('English label', 'التسمية بالإنجليزية')}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (s.labelEn ?? '')) patchShowcase(s.type, { labelEn: v || null });
                  }}
                />
              </td>
              <td data-label={t('Label (Arabic)', 'التسمية (عربي)')}>
                <Input
                  defaultValue={s.labelAr ?? ''}
                  dir="rtl"
                  placeholder={SHOWCASE_LABEL[s.type].ar}
                  aria-label={t('Arabic label', 'التسمية بالعربية')}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (s.labelAr ?? '')) patchShowcase(s.type, { labelAr: v || null });
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-5)' }}>
        {t('Collections', 'المجموعات')}
      </p>
      {collections.isPending ? (
        <ProductGridSkeleton count={2} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Name', 'الاسم')}</th>
              <th>{t('In nav', 'في التنقل')}</th>
              <th>{t('On home', 'في الرئيسية')}</th>
              <th>{t('Sort', 'الترتيب')}</th>
            </tr>
          </thead>
          <tbody>
            {(collections.data ?? []).map((c) => (
              <tr key={c.id}>
                <td data-label={t('Name', 'الاسم')}>
                  {isAr ? c.nameAr : c.nameEn}
                  {c.archivedAt && <span style={{ color: 'var(--color-text-muted)' }}> · {t('archived', 'مؤرشفة')}</span>}
                </td>
                <td data-label={t('In nav', 'في التنقل')}>
                  <Choice
                    type="checkbox"
                    label={<span className="visually-hidden">{t('In nav', 'في التنقل')}</span>}
                    checked={c.showInNav}
                    onChange={(e) => patchCollection(c.id, { showInNav: e.target.checked })}
                  />
                </td>
                <td data-label={t('On home', 'في الرئيسية')}>
                  <Choice
                    type="checkbox"
                    label={<span className="visually-hidden">{t('On home', 'في الرئيسية')}</span>}
                    checked={c.showOnHome}
                    onChange={(e) => patchCollection(c.id, { showOnHome: e.target.checked })}
                  />
                </td>
                <td data-label={t('Sort', 'الترتيب')}>
                  <Input
                    type="number"
                    min={0}
                    defaultValue={c.sortOrder}
                    aria-label={t('Sort order', 'ترتيب العرض')}
                    style={{ width: '4.5rem' }}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isInteger(next) && next >= 0 && next !== c.sortOrder) {
                        patchCollection(c.id, { sortOrder: next });
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-5)' }}>
        {t('Categories', 'الفئات')}
      </p>
      {categories.isPending ? (
        <ProductGridSkeleton count={2} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Name', 'الاسم')}</th>
              <th>{t('Collection', 'المجموعة')}</th>
              <th>{t('On home', 'في الرئيسية')}</th>
              <th>{t('Sort', 'الترتيب')}</th>
            </tr>
          </thead>
          <tbody>
            {(categories.data ?? []).map((c) => (
              <tr key={c.id}>
                <td data-label={t('Name', 'الاسم')}>
                  {isAr ? c.nameAr : c.nameEn}
                  {c.archivedAt && <span style={{ color: 'var(--color-text-muted)' }}> · {t('archived', 'مؤرشفة')}</span>}
                </td>
                <td data-label={t('Collection', 'المجموعة')}>
                  {c.collection ? (isAr ? c.collection.nameAr : c.collection.nameEn) : t('Standalone', 'مستقلة')}
                </td>
                <td data-label={t('On home', 'في الرئيسية')}>
                  <Choice
                    type="checkbox"
                    label={<span className="visually-hidden">{t('On home', 'في الرئيسية')}</span>}
                    checked={c.showOnHome}
                    onChange={(e) => patchCategory(c.id, { showOnHome: e.target.checked })}
                  />
                </td>
                <td data-label={t('Sort', 'الترتيب')}>
                  <Input
                    type="number"
                    min={0}
                    defaultValue={c.sortOrder}
                    aria-label={t('Sort order', 'ترتيب العرض')}
                    style={{ width: '4.5rem' }}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isInteger(next) && next >= 0 && next !== c.sortOrder) {
                        patchCategory(c.id, { sortOrder: next });
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
