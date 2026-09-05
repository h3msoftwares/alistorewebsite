'use client';

import { useState } from 'react';
import { Alert, Choice, DataTable, Input, ProductGridSkeleton } from '@/components/ui';
import {
  useAdminCategories,
  useAdminCollections,
  useUpdateCategory,
  useUpdateCollection,
} from '@/hooks/use-catalog';

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
  const updateCollection = useUpdateCollection();
  const updateCategory = useUpdateCategory();
  const [error, setError] = useState<string | null>(null);

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
