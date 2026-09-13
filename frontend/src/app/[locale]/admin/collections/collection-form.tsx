'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Alert, Button, Choice, Field, Input, Select, Textarea } from '@/components/ui';

// No showInNav / showOnHome / showOnHomeAsImage / accentColor / homeImageCta*
// here on purpose (Stage 1 catalog redesign): those fields still exist on
// the Collection model (left in place rather than migrated away, same as
// Product.quantity — see fix-list.md #16), but Collection no longer has a
// nav/home-banner role at all — top-level Categories (Women/Men/Kids) took
// it over, see the implementation plan's nav/banner decision. Exposing dead
// toggles here would silently mislead an admin into thinking they still do
// something.
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
  type: z.enum(['MANUAL', 'AUTOMATED', 'HYBRID']),
});
export type CollectionFormValues = z.infer<typeof collectionFormSchema>;

export const collectionFormDefaults: CollectionFormValues = {
  nameEn: '',
  nameAr: '',
  slug: '',
  descriptionEn: '',
  descriptionAr: '',
  isActive: true,
  type: 'MANUAL',
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
        <Field
          label={t('Membership type', 'نوع العضوية')}
          hint={t(
            'Manual: pick products by hand. Automated: computed from rules. Hybrid: rules plus a manual include/exclude on top.',
            'يدوي: اختر المنتجات يدويًا. آلي: يُحسب من القواعد. مختلط: القواعد مع إضافة/استبعاد يدوي فوقها.'
          )}
        >
          {(p) => (
            <Select {...p} {...register('type')} disabled={busy}>
              <option value="MANUAL">{t('Manual', 'يدوي')}</option>
              <option value="AUTOMATED">{t('Automated', 'آلي')}</option>
              <option value="HYBRID">{t('Hybrid', 'مختلط')}</option>
            </Select>
          )}
        </Field>
        <Choice type="checkbox" label={t('Active', 'مفعّل')} {...register('isActive')} disabled={busy} />
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
