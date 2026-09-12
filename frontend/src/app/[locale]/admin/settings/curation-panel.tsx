'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Alert, Choice, DataTable, EmptyState, Icon, Input, ProductGridSkeleton } from '@/components/ui';
import { ReorderList, type ReorderItem } from '@/components/admin/reorder-list';
import { useAdminCategories, useUpdateCategory } from '@/hooks/use-catalog';
import { useSettings, useUpdateSettings } from '@/hooks/use-settings';
import type { HomeShowcase, ShowcaseType } from '@/lib/types';

const SHOWCASE_ORDER: ShowcaseType[] = ['BEST_SELLERS', 'NEW_ARRIVALS', 'ON_SALE'];
const SHOWCASE_LABEL: Record<ShowcaseType, { en: string; ar: string }> = {
  BEST_SELLERS: { en: 'Best sellers', ar: 'الأكثر مبيعًا' },
  NEW_ARRIVALS: { en: 'New arrivals', ar: 'وصل حديثًا' },
  ON_SALE: { en: 'On sale', ar: 'التخفيضات' },
};

/** Gap between persisted positions so a single move only re-numbers a few rows. */
const STEP = 10;

/** One block on the "Home page order" list. */
type HomeItem = {
  key: string;
  kindLabel: { en: string; ar: string };
  name: string;
  order: number;
  setOrder: (n: number) => void;
  remove: () => void;
};

/**
 * Quick-edit grid for the top nav and the home page.
 *
 *  - "Home page order" and "Nav order" are drag-to-reorder lists — the list
 *    order IS the on-page order (persisted as `homeSortOrder` / `sortOrder`).
 *  - The two are completely independent: a root category can be in the nav
 *    AND on the home page, positioned differently in each. Membership is the
 *    toggles in the categories tables below; the ✕ on a home row just
 *    removes it from the home page.
 *
 * Nav/home-banner curation moved from Collection to (top-level) Category
 * with the Stage 1 catalog redesign — Women/Men/Kids are Categories now, and
 * Collection (Sale, New Arrivals) has no nav/home-banner role at all. See
 * catalog-redesign-implementation-plan.md's nav/banner decision.
 */
export function CurationPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const nameOf = (o: { nameEn: string; nameAr: string }) => (isAr ? o.nameAr : o.nameEn);

  const categories = useAdminCategories({ status: 'all' });
  const { data: settings } = useSettings();
  const updateCategory = useUpdateCategory();
  const updateSettings = useUpdateSettings();
  const [error, setError] = useState<string | null>(null);

  const onErr = (e: unknown) =>
    setError(e instanceof Error ? e.message : t('Update failed', 'فشل التحديث'));

  const patchCategory = (id: string, body: Record<string, unknown>) => {
    setError(null);
    updateCategory.mutate({ id, body }, { onError: onErr });
  };

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
      { onError: onErr }
    );
  };

  const cats = categories.data ?? [];
  const topCats = cats.filter((c) => !c.parentID);
  // Non-root categories only — a root's own home-row/banner membership is
  // managed by the "Top-level categories" table below instead, so it isn't
  // controlled from two places at once.
  const subCats = cats.filter((c) => c.parentID);

  // ---- Home page order (drag list) ----
  const homeItems: HomeItem[] = [
    ...topCats
      .filter((c) => c.showOnHomeAsImage)
      .map((c): HomeItem => ({
        key: `banner-${c.id}`,
        kindLabel: { en: 'Image banner', ar: 'شريط صورة' },
        name: nameOf(c),
        order: c.homeSortOrder,
        setOrder: (n) => patchCategory(c.id, { homeSortOrder: n }),
        remove: () => patchCategory(c.id, { showOnHome: false, showOnHomeAsImage: false }),
      })),
    ...topCats
      .filter((c) => c.showOnHome && !c.showOnHomeAsImage)
      .map((c): HomeItem => ({
        key: `top-${c.id}`,
        kindLabel: { en: 'Top category row', ar: 'صف فئة رئيسية' },
        name: nameOf(c),
        order: c.homeSortOrder,
        setOrder: (n) => patchCategory(c.id, { homeSortOrder: n }),
        remove: () => patchCategory(c.id, { showOnHome: false }),
      })),
    ...subCats
      .filter((c) => c.showOnHome)
      .map((c): HomeItem => ({
        key: `cat-${c.id}`,
        kindLabel: { en: 'Category row', ar: 'صف فئة' },
        name: nameOf(c),
        order: c.homeSortOrder,
        setOrder: (n) => patchCategory(c.id, { homeSortOrder: n }),
        remove: () => patchCategory(c.id, { showOnHome: false }),
      })),
    ...showcases
      .filter((s) => s.isActive)
      .map((s): HomeItem => ({
        key: `smart-${s.type}`,
        kindLabel: { en: 'Smart row', ar: 'صف ذكي' },
        name:
          (isAr ? s.labelAr : s.labelEn)?.trim() ||
          (isAr ? SHOWCASE_LABEL[s.type].ar : SHOWCASE_LABEL[s.type].en),
        order: s.sortOrder,
        setOrder: (n) => patchShowcase(s.type, { sortOrder: n }),
        remove: () => patchShowcase(s.type, { isActive: false }),
      })),
  ].sort((a, b) => a.order - b.order);

  const homeRows: ReorderItem[] = homeItems.map((it) => ({
    key: it.key,
    content: (
      <>
        <span className="reorder-list__name">{it.name}</span>
        <span className="reorder-list__meta">{isAr ? it.kindLabel.ar : it.kindLabel.en}</span>
        <button
          type="button"
          className="icon-btn icon-btn--bordered"
          onClick={() => it.remove()}
          aria-label={t(`Remove ${it.name} from the home page`, `إزالة ${it.name} من الصفحة الرئيسية`)}
        >
          <Icon as={X} size={16} />
        </button>
      </>
    ),
  }));

  const reorderHome = (keys: string[]) => {
    setError(null);
    keys.forEach((k, i) => {
      const it = homeItems.find((x) => x.key === k);
      const next = (i + 1) * STEP;
      if (it && it.order !== next) it.setOrder(next);
    });
  };

  // ---- Nav order (drag list) ----
  const navCats = topCats
    .filter((c) => c.showInNav)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const navRows: ReorderItem[] = navCats.map((c) => ({
    key: c.id,
    content: <span className="reorder-list__name">{nameOf(c)}</span>,
  }));

  const reorderNav = (ids: string[]) => {
    setError(null);
    ids.forEach((id, i) => {
      const c = navCats.find((x) => x.id === id);
      const next = (i + 1) * STEP;
      if (c && c.sortOrder !== next) patchCategory(id, { sortOrder: next });
    });
  };

  const loading = categories.isPending;

  return (
    <section className="admin-form">
      <p className="admin-form__section-title">{t('Navigation & home page', 'التنقل والصفحة الرئيسية')}</p>

      {error && <Alert tone="danger">{error}</Alert>}

      {/* -------- Home page order -------- */}
      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-4)' }}>
        {t('Home page order', 'ترتيب الصفحة الرئيسية')}
      </p>
      <p className="admin-form__hint">
        {t(
          'Every block on the home page, top to bottom. Drag a row by its handle to move it; the list order is the page order. ✕ takes a block off the home page — add blocks back with the toggles below.',
          'كل عناصر الصفحة الرئيسية من الأعلى للأسفل. اسحب الصف من المقبض لتحريكه؛ ترتيب القائمة هو ترتيب الصفحة. ✕ تُزيل العنصر — أعد إضافته من الخيارات أدناه.'
        )}
      </p>
      {loading ? (
        <ProductGridSkeleton count={2} />
      ) : homeRows.length === 0 ? (
        <EmptyState title={t('Nothing on the home page yet', 'لا شيء في الصفحة الرئيسية بعد')} />
      ) : (
        <ReorderList
          items={homeRows}
          onReorder={reorderHome}
          ariaLabel={t('Home page order', 'ترتيب الصفحة الرئيسية')}
          handleLabel={t('Drag to reorder', 'اسحب لإعادة الترتيب')}
        />
      )}

      {/* -------- Nav order -------- */}
      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-5)' }}>
        {t('Nav order', 'ترتيب التنقل')}
      </p>
      <p className="admin-form__hint">
        {t(
          'The top-level categories in the top nav, left to right. Drag to reorder — independent of the home page. Add or remove them with the "In nav" toggle below.',
          'الفئات الرئيسية في شريط التنقل من اليسار لليمين. اسحب لإعادة الترتيب — مستقل عن الصفحة الرئيسية. أضف أو أزل عبر خيار "في التنقل" أدناه.'
        )}
      </p>
      {loading ? (
        <ProductGridSkeleton count={1} />
      ) : navRows.length === 0 ? (
        <EmptyState title={t('No categories in the nav yet', 'لا توجد فئات في التنقل بعد')} />
      ) : (
        <ReorderList
          items={navRows}
          onReorder={reorderNav}
          ariaLabel={t('Nav order', 'ترتيب التنقل')}
          handleLabel={t('Drag to reorder', 'اسحب لإعادة الترتيب')}
        />
      )}

      {/* -------- Top-level categories: nav/home membership toggles -------- */}
      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-5)' }}>
        {t('Top-level categories', 'الفئات الرئيسية')}
      </p>
      {categories.isPending ? (
        <ProductGridSkeleton count={2} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Name', 'الاسم')}</th>
              <th>{t('In nav', 'في التنقل')}</th>
              <th>{t('Home row', 'صف الرئيسية')}</th>
              <th>{t('Image banner', 'شريط صورة')}</th>
            </tr>
          </thead>
          <tbody>
            {topCats.map((c) => (
              <tr key={c.id}>
                <td data-label={t('Name', 'الاسم')}>
                  {nameOf(c)}
                  {c.archivedAt && (
                    <span style={{ color: 'var(--color-text-muted)' }}> · {t('archived', 'مؤرشفة')}</span>
                  )}
                </td>
                <td data-label={t('In nav', 'في التنقل')}>
                  <Choice
                    type="checkbox"
                    label={<span className="visually-hidden">{t('In nav', 'في التنقل')}</span>}
                    checked={c.showInNav}
                    onChange={(e) => patchCategory(c.id, { showInNav: e.target.checked })}
                  />
                </td>
                <td data-label={t('Home row', 'صف الرئيسية')}>
                  <Choice
                    type="checkbox"
                    label={<span className="visually-hidden">{t('Home row', 'صف الرئيسية')}</span>}
                    checked={c.showOnHome}
                    disabled={c.showOnHomeAsImage}
                    onChange={(e) => patchCategory(c.id, { showOnHome: e.target.checked })}
                  />
                </td>
                <td data-label={t('Image banner', 'شريط صورة')}>
                  <Choice
                    type="checkbox"
                    label={<span className="visually-hidden">{t('Image banner', 'شريط صورة')}</span>}
                    checked={c.showOnHomeAsImage}
                    onChange={(e) => patchCategory(c.id, { showOnHomeAsImage: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <p className="admin-form__hint">
        {t(
          '"In nav" and the home-page toggles are independent. "Image banner" replaces "Home row"; a category shows as one or the other.',
          '"في التنقل" وخيارات الرئيسية مستقلة. "شريط صورة" يحل محل "صف الرئيسية".'
        )}
      </p>

      {/* -------- Other categories: home membership -------- */}
      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-5)' }}>
        {t('Other categories', 'فئات أخرى')}
      </p>
      {categories.isPending ? (
        <ProductGridSkeleton count={2} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Name', 'الاسم')}</th>
              <th>{t('Parent', 'الفئة الأصل')}</th>
              <th>{t('Home row', 'صف الرئيسية')}</th>
            </tr>
          </thead>
          <tbody>
            {subCats.map((c) => (
              <tr key={c.id}>
                <td data-label={t('Name', 'الاسم')}>
                  {nameOf(c)}
                  {c.archivedAt && (
                    <span style={{ color: 'var(--color-text-muted)' }}> · {t('archived', 'مؤرشفة')}</span>
                  )}
                </td>
                <td data-label={t('Parent', 'الفئة الأصل')}>{c.parent ? nameOf(c.parent) : '—'}</td>
                <td data-label={t('Home row', 'صف الرئيسية')}>
                  <Choice
                    type="checkbox"
                    label={<span className="visually-hidden">{t('Home row', 'صف الرئيسية')}</span>}
                    checked={c.showOnHome}
                    onChange={(e) => patchCategory(c.id, { showOnHome: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {/* -------- Smart rows: on/off + labels -------- */}
      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-5)' }}>
        {t('Smart home rows', 'صفوف الرئيسية الذكية')}
      </p>
      <p className="admin-form__hint">
        {t(
          'Built-in product rows — no category needed. Order them in "Home page order" above.',
          'صفوف منتجات جاهزة دون الحاجة لفئة. رتّبها من "ترتيب الصفحة الرئيسية" أعلاه.'
        )}
      </p>
      <DataTable responsive>
        <thead>
          <tr>
            <th>{t('Row', 'الصف')}</th>
            <th>{t('On home', 'في الرئيسية')}</th>
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
              <td data-label={t('Label (English)', 'التسمية (إنجليزي)')}>
                <Input
                  defaultValue={s.labelEn ?? ''}
                  key={`lblEn-${s.type}-${s.labelEn ?? ''}`}
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
                  key={`lblAr-${s.type}-${s.labelAr ?? ''}`}
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
    </section>
  );
}
