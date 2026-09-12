'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Choice, Field, Input, Select } from '@/components/ui';
import { useCollections } from '@/hooks/use-catalog';

export const categoryFormSchema = z.object({
  nameEn: z.string().min(1, 'Required'),
  nameAr: z.string().min(1, 'Required'),
  slug: z
    .string()
    .min(1, 'Required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase, kebab-case (e.g. summer-dresses)'),
  // '' = standalone (no collection) — mapped to null when the page submits.
  collectionId: z.string(),
  isActive: z.boolean(),
  showOnHome: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const categoryFormDefaults: CategoryFormValues = {
  nameEn: '',
  nameAr: '',
  slug: '',
  collectionId: '',
  isActive: true,
  showOnHome: false,
  sortOrder: 0,
};

export function CategoryForm({
  locale,
  defaultValues,
  onSubmit,
  submitLabel,
  isSubmitting,
  submitError,
}: {
  locale: 'en' | 'ar';
  defaultValues: CategoryFormValues;
  onSubmit: (values: CategoryFormValues) => void | Promise<void>;
  submitLabel: string;
  isSubmitting: boolean;
  submitError?: string | null;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: collections } = useCollections({ includeInactive: true });

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
        label={t('Collection', 'المجموعة')}
        hint={t('Leave as "Standalone" for a category not tied to any collection', 'اتركها "مستقلة" لفئة غير مرتبطة بأي مجموعة')}
      >
        {(p) => (
          <Select {...p} {...register('collectionId')} disabled={busy}>
            <option value="">{t('Standalone (no collection)', 'مستقلة (بدون مجموعة)')}</option>
            {(collections ?? []).map((c) => (
              // Archived collections stay in this list (this category might
              // already be assigned to one) but are visually flagged and
              // blocked from being picked as a NEW assignment — previously
              // indistinguishable from an active one (fix-list.md #15,
              // resolves 12.2). A native <option> can't carry richer
              // styling than plain text, so the label suffix is the only
              // available signal.
              <option key={c.id} value={c.id} disabled={Boolean(c.archivedAt)}>
                {isAr ? c.nameAr : c.nameEn}
                {c.archivedAt ? t(' (archived)', ' (مؤرشفة)') : ''}
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
