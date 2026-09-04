'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Choice, Field, Input, Textarea } from '@/components/ui';

export const collectionFormSchema = z.object({
  nameEn: z.string().min(1, 'Required'),
  nameAr: z.string().min(1, 'Required'),
  slug: z
    .string()
    .min(1, 'Required')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase, kebab-case (e.g. summer-sale)'),
  descriptionEn: z.string(),
  descriptionAr: z.string(),
  isActive: z.boolean(),
  showInNav: z.boolean(),
  showOnHome: z.boolean(),
  // Plain z.number(), not z.coerce.number() — coercion gives the schema an
  // `unknown` input type that zodResolver's generics can't reconcile with
  // useForm<Values>'s z.infer (output) type. RHF's own register(...,
  // { valueAsNumber: true }) below does the string->number conversion
  // instead, so the field is already a number by the time Zod sees it.
  sortOrder: z.number().int().nonnegative(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a #rrggbb hex colour')
    .or(z.literal('')),
});
export type CollectionFormValues = z.infer<typeof collectionFormSchema>;

export const collectionFormDefaults: CollectionFormValues = {
  nameEn: '',
  nameAr: '',
  slug: '',
  descriptionEn: '',
  descriptionAr: '',
  isActive: true,
  showInNav: false,
  showOnHome: false,
  sortOrder: 0,
  accentColor: '',
};

export function CollectionForm({
  locale,
  defaultValues,
  onSubmit,
  submitLabel,
  isSubmitting,
  submitError,
}: {
  locale: 'en' | 'ar';
  defaultValues: CollectionFormValues;
  onSubmit: (values: CollectionFormValues) => void | Promise<void>;
  submitLabel: string;
  isSubmitting: boolean;
  submitError?: string | null;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CollectionFormValues>({ resolver: zodResolver(collectionFormSchema), defaultValues });

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

      <div className="admin-form__row">
        <Field label={t('Description (English)', 'الوصف (إنجليزي)')}>
          {(p) => <Textarea {...p} {...register('descriptionEn')} rows={3} disabled={busy} />}
        </Field>
        <Field label={t('Description (Arabic)', 'الوصف (عربي)')}>
          {(p) => <Textarea {...p} {...register('descriptionAr')} rows={3} dir="rtl" disabled={busy} />}
        </Field>
      </div>

      <div className="admin-form__row">
        <Field label={t('Sort order', 'ترتيب العرض')} hint={t('Lower shows first', 'الأصغر يظهر أولاً')} error={errors.sortOrder?.message}>
          {(p) => (
            <Input {...p} type="number" min={0} {...register('sortOrder', { valueAsNumber: true })} disabled={busy} />
          )}
        </Field>
        <Field
          label={t('Accent colour', 'لون مميز')}
          hint={t('#rrggbb, optional', '#rrggbb، اختياري')}
          error={errors.accentColor?.message}
        >
          {(p) => <Input {...p} type="text" placeholder="#a65a7e" {...register('accentColor')} disabled={busy} />}
        </Field>
      </div>

      <div className="admin-form__row">
        <Choice type="checkbox" label={t('Active', 'مفعّل')} {...register('isActive')} disabled={busy} />
        <Choice type="checkbox" label={t('Show in nav', 'إظهار في التنقل')} {...register('showInNav')} disabled={busy} />
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
