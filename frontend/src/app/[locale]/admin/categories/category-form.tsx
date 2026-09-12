'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Choice, Field, Input, Select } from '@/components/ui';
import { useAdminCategories } from '@/hooks/use-catalog';
import type { Category } from '@/lib/types';

export const categoryFormSchema = z.object({
  nameEn: z.string().min(1, 'Required'),
  nameAr: z.string().min(1, 'Required'),
  slug: z
    .string()
    .min(1, 'Required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase, kebab-case (e.g. summer-dresses)'),
  // '' = root category (no parent) — mapped to null when the page submits.
  parentId: z.string(),
  isActive: z.boolean(),
  showOnHome: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const categoryFormDefaults: CategoryFormValues = {
  nameEn: '',
  nameAr: '',
  slug: '',
  parentId: '',
  isActive: true,
  showOnHome: false,
  sortOrder: 0,
};

// Every id in `category`'s own subtree (itself included) — a category can
// never become a descendant of one of its own descendants. The backend
// trigger enforces this too (the actual guarantee), but filtering the
// picker down front avoids a doomed-to-fail selection.
function subtreeIds(category: Category, all: Category[]): Set<string> {
  const ids = new Set([category.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentID && ids.has(c.parentID) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function CategoryForm({
  locale,
  editingId,
  defaultValues,
  onSubmit,
  submitLabel,
  isSubmitting,
  submitError,
}: {
  locale: 'en' | 'ar';
  /** The category being edited, when this is not a create form — excluded
   *  (along with its own descendants) from the parent picker. */
  editingId?: string;
  defaultValues: CategoryFormValues;
  onSubmit: (values: CategoryFormValues) => void | Promise<void>;
  submitLabel: string;
  isSubmitting: boolean;
  submitError?: string | null;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: allCategories } = useAdminCategories();
  const editing = editingId ? allCategories?.find((c) => c.id === editingId) : undefined;
  const excluded = editing && allCategories ? subtreeIds(editing, allCategories) : new Set<string>();
  const pickable = (allCategories ?? []).filter((c) => !excluded.has(c.id));

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryFormValues>({ resolver: zodResolver(categoryFormSchema), defaultValues });

  const busy = isSubmitting;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
      <div className="admin-form__row">
        <Field label={t('Name (English)', 'الاسم (إنجليزي)')} error={errors.nameEn?.message} required>
          {(p) => <Input {...p} {...register('nameEn')} disabled={busy} />}
        </Field>
        <Field label={t('Name (Arabic)', 'الاسم (عربي)')} error={errors.nameAr?.message} required>
          {(p) => <Input {...p} {...register('nameAr')} dir="rtl" disabled={busy} />}
        </Field>
      </div>

      <Field
        label={t('Slug', 'الرابط')}
        hint={t('Lowercase, kebab-case — used in the storefront URL', 'أحرف صغيرة وشرطات — يُستخدم في رابط المتجر')}
        error={errors.slug?.message}
        required
      >
        {(p) => <Input {...p} {...register('slug')} disabled={busy} />}
      </Field>

      <Field
        label={t('Parent category', 'الفئة الأصل')}
        hint={t('Leave as "Top level" for a root category (e.g. Women, Men, Kids)', 'اتركها "المستوى الأعلى" لفئة رئيسية (مثل نساء، رجال، أطفال)')}
      >
        {(p) => (
          <Select {...p} {...register('parentId')} disabled={busy}>
            <option value="">{t('Top level (no parent)', 'المستوى الأعلى (بدون أصل)')}</option>
            {pickable.map((c) => (
              // A category whose own archivedAt is unset can still be
              // unreachable on the storefront if an ANCESTOR is archived
              // (isEffectivelyArchived, computed server-side) — flagged here
              // too, not just a directly-archived option, so assigning a new
              // category under it doesn't silently create another invisible
              // one (fix-list.md #15's principle, carried onto the tree).
              <option key={c.id} value={c.id} disabled={Boolean(c.isEffectivelyArchived)}>
                {'—'.repeat(c.depth)} {isAr ? c.nameAr : c.nameEn}
                {c.isEffectivelyArchived ? t(' (archived)', ' (مؤرشفة)') : ''}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={t('Sort order', 'ترتيب العرض')} hint={t('Lower shows first', 'الأصغر يظهر أولاً')} error={errors.sortOrder?.message}>
        {(p) => (
          <Input {...p} type="number" min={0} {...register('sortOrder', { valueAsNumber: true })} disabled={busy} />
        )}
      </Field>

      <div className="admin-form__row">
        <Choice type="checkbox" label={t('Active', 'مفعّل')} {...register('isActive')} disabled={busy} />
        <Choice type="checkbox" label={t('Show on home', 'إظهار في الرئيسية')} {...register('showOnHome')} disabled={busy} />
      </div>

      {submitError && <Alert tone="danger">{submitError}</Alert>}

      <div className="admin-form__actions">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
