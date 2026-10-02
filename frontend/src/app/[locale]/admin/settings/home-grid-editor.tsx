'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Choice, Field, Icon, Input } from '@/components/ui';
import { CategoryPicker } from '@/components/admin/category-picker';
import { ReorderList, type ReorderItem } from '@/components/admin/reorder-list';
import type { Category, HomeGrid, SiteSettingsBody } from '@/lib/types';

export type HomeGridDraft = NonNullable<SiteSettingsBody['homeGrids']>[number];

export const gridToDraft = (g: HomeGrid): HomeGridDraft => ({
  isActive: g.isActive,
  sortOrder: g.sortOrder,
  titleEn: g.titleEn ?? '',
  titleAr: g.titleAr ?? '',
  categoryIds: g.items.map((it) => it.categoryID),
});

/**
 * Edits one home category grid: optional admin-only label, on/off, and its 2+
 * categories (add with the picker, drag to reorder, ✕ to remove). Local
 * state until Save — a grid with fewer than 2 categories can't be saved, so
 * a half-built one never reaches the storefront. The parent owns persisting
 * (settings `homeGrids` is replace-all).
 */
export function HomeGridEditor({
  locale,
  categories,
  initial,
  onSave,
  onDelete,
  saving,
}: {
  locale: 'en' | 'ar';
  categories: Category[];
  initial: HomeGridDraft;
  onSave: (draft: HomeGridDraft) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const [draft, setDraft] = useState(initial);
  const [picking, setPicking] = useState('');

  const byId = new Map(categories.map((c) => [c.id, c]));
  const nameOf = (id: string) => {
    const c = byId.get(id);
    return c ? (isAr ? c.nameAr : c.nameEn) : t('(deleted)', '(محذوفة)');
  };
  const pickable = categories.filter((c) => !c.archivedAt && !draft.categoryIds.includes(c.id));
  const canSave = draft.categoryIds.length >= 2 && draft.categoryIds.length <= 6;

  const rows: ReorderItem[] = draft.categoryIds.map((id) => ({
    key: id,
    content: (
      <>
        <span className="reorder-list__name">{nameOf(id)}</span>
        <button
          type="button"
          className="icon-btn icon-btn--bordered"
          onClick={() => setDraft({ ...draft, categoryIds: draft.categoryIds.filter((x) => x !== id) })}
          aria-label={t(`Remove ${nameOf(id)} from the grid`, `إزالة ${nameOf(id)} من الشبكة`)}
        >
          <Icon as={X} size={16} />
        </button>
      </>
    ),
  }));

  return (
    <div className="admin-form" style={{ border: '1px solid var(--color-border)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)' }}>
      <div className="admin-form__row">
        <Field label={t('Label (English)', 'التسمية (إنجليزي)')} hint={t('Admin label only — not shown on the site', 'للإدارة فقط — لا يظهر في الموقع')}>
          {(p) => (
            <Input {...p} value={draft.titleEn ?? ''} onChange={(e) => setDraft({ ...draft, titleEn: e.target.value })} />
          )}
        </Field>
        <Field label={t('Label (Arabic)', 'التسمية (عربي)')} hint={t('Admin label only — not shown on the site', 'للإدارة فقط — لا يظهر في الموقع')}>
          {(p) => (
            <Input
              {...p}
              dir="rtl"
              value={draft.titleAr ?? ''}
              onChange={(e) => setDraft({ ...draft, titleAr: e.target.value })}
            />
          )}
        </Field>
      </div>

      {rows.length > 0 && (
        <ReorderList
          items={rows}
          onReorder={(ids) => setDraft({ ...draft, categoryIds: ids })}
          ariaLabel={t('Grid categories', 'فئات الشبكة')}
          handleLabel={t('Drag to reorder', 'اسحب لإعادة الترتيب')}
        />
      )}

      {draft.categoryIds.length < 6 && (
        <Field label={t('Add a category', 'إضافة فئة')}>
          {(p) => (
            <CategoryPicker
              {...p}
              categories={pickable}
              value={picking}
              onChange={(id) => {
                setPicking('');
                if (id) setDraft({ ...draft, categoryIds: [...draft.categoryIds, id] });
              }}
              locale={locale}
              placeholder={t('Choose a category…', 'اختر فئة…')}
            />
          )}
        </Field>
      )}
      <p className="admin-form__hint">
        {t(
          '2 to 6 categories, side by side in this order — as many per row as the screen fits (2 on phones, 3+ on larger screens). Each tile is the category’s first image with its name on it, linking to it.',
          'من 2 إلى 6 فئات جنبًا إلى جنب بهذا الترتيب — بقدر ما تتسع الشاشة (2 على الهاتف، 3 أو أكثر على الشاشات الأكبر). كل مربع يعرض أول صورة للفئة واسمها عليها ويربط إليها.'
        )}
      </p>

      <div className="admin-form__row" style={{ alignItems: 'center' }}>
        <Choice
          type="checkbox"
          label={t('Show on home', 'إظهار في الرئيسية')}
          checked={draft.isActive}
          onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
        />
      </div>

      <div className="admin-form__actions">
        <Button type="button" onClick={() => onSave(draft)} disabled={!canSave} loading={saving}>
          {t('Save grid', 'حفظ الشبكة')}
        </Button>
        <Button type="button" variant="danger" onClick={onDelete} disabled={saving}>
          {t('Delete grid', 'حذف الشبكة')}
        </Button>
      </div>
    </div>
  );
}
