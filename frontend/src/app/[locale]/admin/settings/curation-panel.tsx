'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Alert, Button, Choice, DataTable, EmptyState, Icon, Input, ProductGridSkeleton } from '@/components/ui';
import { ReorderList, type ReorderItem } from '@/components/admin/reorder-list';
import { useAdminCategories, useUpdateCategory } from '@/hooks/use-catalog';
import { usePermissions } from '@/lib/rbac';
import { useSettings, useUpdateSettings } from '@/hooks/use-settings';
import type { HomeShowcase, ShowcaseType } from '@/lib/types';
import { HomeGridEditor, gridToDraft, type HomeGridDraft } from './home-grid-editor';

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
  /** Set for a category grid — grids are saved replace-all, so a reorder
   *  batches every grid's new position into one settings update. */
  gridId?: string;
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
  // Unsaved "New grid" editors (keys only — each editor owns its draft).
  const [newGridKeys, setNewGridKeys] = useState<number[]>([]);

  // This panel mutates both categories (`categories:manage`, for the nav/
  // home toggles below) and site settings (`settings:manage`, for the smart
  // row on/off + labels) — require both before treating any of it as
  // editable, since a caller with only one would see controls that always
  // 403 the other resource's half of this screen.
  const { has } = usePermissions();
  const canManage = has('categories:manage') && has('settings:manage');

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

  // ---- Category grids (replace-all through settings) ----
  const grids = settings?.homeGrids ?? [];
  const saveGrids = (drafts: HomeGridDraft[], onSuccess?: () => void) => {
    setError(null);
    updateSettings.mutate({ homeGrids: drafts }, { onError: onErr, onSuccess });
  };
  const gridName = (g: (typeof grids)[number]) =>
    (isAr ? g.titleAr : g.titleEn)?.trim() ||
    g.items.map((it) => (isAr ? it.category.nameAr : it.category.nameEn)).join(' · ');

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
    ...grids
      .filter((g) => g.isActive)
      .map((g): HomeItem => ({
        key: `grid-${g.id}`,
        kindLabel: { en: 'Category grid', ar: 'شبكة فئات' },
        name: gridName(g),
        order: g.sortOrder,
        gridId: g.id,
        setOrder: (n) =>
          saveGrids(grids.map((x) => ({ ...gridToDraft(x), sortOrder: x.id === g.id ? n : x.sortOrder }))),
        remove: () =>
          saveGrids(grids.map((x) => ({ ...gridToDraft(x), isActive: x.id === g.id ? false : x.isActive }))),
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
    const gridOrder = new Map<string, number>();
    keys.forEach((k, i) => {
      const it = homeItems.find((x) => x.key === k);
      const next = (i + 1) * STEP;
      if (!it || it.order === next) return;
      if (it.gridId) gridOrder.set(it.gridId, next);
      else it.setOrder(next);
    });
    if (gridOrder.size > 0) {
      saveGrids(grids.map((x) => ({ ...gridToDraft(x), sortOrder: gridOrder.get(x.id) ?? x.sortOrder })));
    }
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

      {/* Disables every checkbox/input/button below in one place when the
          caller lacks manage rights. Doesn't reach ReorderList's drag
          gesture (pointer events on a plain div, not a form control — the
          browser's native fieldset-disable only covers form-associated
          elements), so a view-only admin could still technically drag a row;
          the backend would 403 the resulting patch either way, same as
          every other view-vs-manage gap in this admin panel. */}
      <fieldset disabled={!canManage} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>

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

      {/* -------- Category grids -------- */}
      <p className="admin-form__section-title" style={{ marginTop: 'var(--space-5)' }}>
        {t('Category grids', 'شبكات الفئات')}
      </p>
      <p className="admin-form__hint">
        {t(
          'Two or more categories shown side by side on the home page. Order them in "Home page order" above.',
          'فئتان أو أكثر تُعرض جنبًا إلى جنب في الصفحة الرئيسية. رتّبها من "ترتيب الصفحة الرئيسية" أعلاه.'
        )}
      </p>
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {grids.map((g, gi) => (
          <HomeGridEditor
            // Replace-all save re-creates every grid with a new id, so each
            // save remounts the editors with fresh server state.
            key={g.id}
            locale={locale}
            categories={cats}
            initial={gridToDraft(g)}
            saving={updateSettings.isPending}
            onSave={(draft) => saveGrids(grids.map((x, xi) => (xi === gi ? draft : gridToDraft(x))))}
            onDelete={() => saveGrids(grids.filter((_, xi) => xi !== gi).map(gridToDraft))}
          />
        ))}
        {newGridKeys.map((k) => {
          const drop = () => setNewGridKeys((ks) => ks.filter((x) => x !== k));
          return (
            <HomeGridEditor
              key={`new-${k}`}
              locale={locale}
              categories={cats}
              initial={{
                isActive: true,
                // Lands at the bottom of the home page; drag it up from there.
                sortOrder: (homeItems.length + 1) * STEP,
                titleEn: '',
                titleAr: '',
                categoryIds: [],
              }}
              saving={updateSettings.isPending}
              onSave={(draft) => saveGrids([...grids.map(gridToDraft), draft], drop)}
              onDelete={drop}
            />
          );
        })}
      </div>
      <div className="admin-form__actions">
        <Button type="button" variant="outline" onClick={() => setNewGridKeys((ks) => [...ks, Date.now()])}>
          {t('New grid', 'شبكة جديدة')}
        </Button>
      </div>

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
      </fieldset>
    </section>
  );
}
