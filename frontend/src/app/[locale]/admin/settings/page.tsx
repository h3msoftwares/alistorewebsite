'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Button,
  Choice,
  EmptyState,
  Field,
  Icon,
  Input,
  ProductGridSkeleton,
  Select,
  Textarea,
} from '@/components/ui';
import { useAdminCollections } from '@/hooks/use-catalog';
import { useSettings, useUpdateSettings } from '@/hooks/use-settings';
import { CurationPanel } from './curation-panel';

const urlOrEmpty = z.string().trim().url('Must be a full URL (https://…)').or(z.literal(''));

const settingsFormSchema = z.object({
  brandNameEn: z.string().trim().min(1, 'Required'),
  brandNameAr: z.string().trim().min(1, 'Required'),
  contactEmail: z.string().trim().email('Must be an email').or(z.literal('')),
  contactPhone: z.string().trim().max(40),
  instagramUrl: urlOrEmpty,
  facebookUrl: urlOrEmpty,
  tiktokUrl: urlOrEmpty,
  whatsappUrl: urlOrEmpty,
  announcementActive: z.boolean(),
  announcementLines: z
    .array(z.object({ textEn: z.string().trim().min(1, 'Required'), textAr: z.string().trim().min(1, 'Required') }))
    .max(10),
  heroEyebrowEn: z.string(),
  heroEyebrowAr: z.string(),
  heroHeadlineEn: z.string(),
  heroHeadlineAr: z.string(),
  heroLedeEn: z.string(),
  heroLedeAr: z.string(),
  heroCtaLabelEn: z.string(),
  heroCtaLabelAr: z.string(),
  heroCtaCollectionId: z.string(),
  homeMoreHeadingEn: z.string(),
  homeMoreHeadingAr: z.string(),
});
type SettingsForm = z.infer<typeof settingsFormSchema>;

const blankLine = { textEn: '', textAr: '' };

export default function AdminSettingsPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: settings, isPending, isError, refetch } = useSettings();
  const { data: collections } = useAdminCollections({ status: 'all' });
  const updateSettings = useUpdateSettings();

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const values: SettingsForm | undefined = settings && {
    brandNameEn: settings.brandNameEn,
    brandNameAr: settings.brandNameAr,
    contactEmail: settings.contactEmail ?? '',
    contactPhone: settings.contactPhone ?? '',
    instagramUrl: settings.instagramUrl ?? '',
    facebookUrl: settings.facebookUrl ?? '',
    tiktokUrl: settings.tiktokUrl ?? '',
    whatsappUrl: settings.whatsappUrl ?? '',
    announcementActive: settings.announcementActive,
    announcementLines: settings.announcementLines.map((l) => ({ textEn: l.textEn, textAr: l.textAr })),
    heroEyebrowEn: settings.heroEyebrowEn,
    heroEyebrowAr: settings.heroEyebrowAr,
    heroHeadlineEn: settings.heroHeadlineEn,
    heroHeadlineAr: settings.heroHeadlineAr,
    heroLedeEn: settings.heroLedeEn,
    heroLedeAr: settings.heroLedeAr,
    heroCtaLabelEn: settings.heroCtaLabelEn,
    heroCtaLabelAr: settings.heroCtaLabelAr,
    heroCtaCollectionId: settings.heroCtaCollectionID ?? '',
    homeMoreHeadingEn: settings.homeMoreHeadingEn,
    homeMoreHeadingAr: settings.homeMoreHeadingAr,
  };

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsForm>({ resolver: zodResolver(settingsFormSchema), values });
  const { fields, append, remove } = useFieldArray({ control, name: 'announcementLines' });

  const busy = updateSettings.isPending;

  const onSubmit = async (form: SettingsForm) => {
    setError(null);
    setSaved(false);
    try {
      await updateSettings.mutateAsync(form);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  if (isPending) {
    return (
      <div className="section--tight">
        <ProductGridSkeleton count={2} />
      </div>
    );
  }
  if (isError || !settings) {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t("Couldn't load settings", 'تعذّر تحميل الإعدادات')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Settings', 'الإعدادات')}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="admin-form">
        {/* ---- Brand & contact ---- */}
        <p className="admin-form__section-title">{t('Brand & contact', 'العلامة والتواصل')}</p>
        <div className="admin-form__row">
          <Field label={t('Brand name (English)', 'اسم المتجر (إنجليزي)')} error={errors.brandNameEn?.message} required>
            {(p) => <Input {...p} {...register('brandNameEn')} disabled={busy} />}
          </Field>
          <Field label={t('Brand name (Arabic)', 'اسم المتجر (عربي)')} error={errors.brandNameAr?.message} required>
            {(p) => <Input {...p} {...register('brandNameAr')} dir="rtl" disabled={busy} />}
          </Field>
        </div>
        <div className="admin-form__row">
          <Field label={t('Contact email', 'بريد التواصل')} error={errors.contactEmail?.message}>
            {(p) => <Input {...p} type="email" {...register('contactEmail')} disabled={busy} />}
          </Field>
          <Field label={t('Contact phone', 'هاتف التواصل')} error={errors.contactPhone?.message}>
            {(p) => <Input {...p} {...register('contactPhone')} disabled={busy} />}
          </Field>
        </div>
        <div className="admin-form__row">
          <Field label="Instagram" hint={t('Full URL, or blank to hide', 'رابط كامل، أو فارغ للإخفاء')} error={errors.instagramUrl?.message}>
            {(p) => <Input {...p} type="url" placeholder="https://instagram.com/…" {...register('instagramUrl')} disabled={busy} />}
          </Field>
          <Field label="Facebook" error={errors.facebookUrl?.message}>
            {(p) => <Input {...p} type="url" placeholder="https://facebook.com/…" {...register('facebookUrl')} disabled={busy} />}
          </Field>
        </div>
        <div className="admin-form__row">
          <Field label="TikTok" error={errors.tiktokUrl?.message}>
            {(p) => <Input {...p} type="url" placeholder="https://tiktok.com/@…" {...register('tiktokUrl')} disabled={busy} />}
          </Field>
          <Field label="WhatsApp" error={errors.whatsappUrl?.message}>
            {(p) => <Input {...p} type="url" placeholder="https://wa.me/…" {...register('whatsappUrl')} disabled={busy} />}
          </Field>
        </div>

        {/* ---- Announcement strip ---- */}
        <div className="admin-form__section">
          <p className="admin-form__section-title">{t('Announcement strip', 'شريط الإعلانات')}</p>
          <Choice type="checkbox" label={t('Show the announcement strip', 'إظهار شريط الإعلانات')} {...register('announcementActive')} disabled={busy} />
          <p className="admin-form__hint">
            {t('Lines rotate every few seconds. Leave the list empty to hide the strip entirely.', 'تتناوب السطور كل بضع ثوانٍ. اترك القائمة فارغة لإخفاء الشريط تمامًا.')}
          </p>

          {fields.map((field, i) => (
            <div key={field.id} className="admin-variant-row">
              <Field label={t('Line (English)', 'السطر (إنجليزي)')} error={errors.announcementLines?.[i]?.textEn?.message}>
                {(p) => <Input {...p} {...register(`announcementLines.${i}.textEn` as const)} disabled={busy} />}
              </Field>
              <Field label={t('Line (Arabic)', 'السطر (عربي)')} error={errors.announcementLines?.[i]?.textAr?.message}>
                {(p) => <Input {...p} {...register(`announcementLines.${i}.textAr` as const)} dir="rtl" disabled={busy} />}
              </Field>
              <button
                type="button"
                className="icon-btn icon-btn--bordered admin-variant-row__remove"
                onClick={() => remove(i)}
                disabled={busy}
                aria-label={t('Remove line', 'حذف السطر')}
              >
                <Icon as={Trash2} size={16} />
              </button>
            </div>
          ))}
          {fields.length < 10 && (
            <Button type="button" variant="outline" onClick={() => append(blankLine)} disabled={busy}>
              <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
              {t('Add line', 'إضافة سطر')}
            </Button>
          )}
        </div>

        {/* ---- Home hero ---- */}
        <div className="admin-form__section">
          <p className="admin-form__section-title">{t('Home hero', 'واجهة الرئيسية')}</p>
          <div className="admin-form__row">
            <Field label={t('Eyebrow (English)', 'تمهيد (إنجليزي)')}>
              {(p) => <Input {...p} {...register('heroEyebrowEn')} disabled={busy} />}
            </Field>
            <Field label={t('Eyebrow (Arabic)', 'تمهيد (عربي)')}>
              {(p) => <Input {...p} {...register('heroEyebrowAr')} dir="rtl" disabled={busy} />}
            </Field>
          </div>
          <div className="admin-form__row">
            <Field label={t('Headline (English)', 'العنوان (إنجليزي)')}>
              {(p) => <Textarea {...p} rows={2} {...register('heroHeadlineEn')} disabled={busy} />}
            </Field>
            <Field label={t('Headline (Arabic)', 'العنوان (عربي)')}>
              {(p) => <Textarea {...p} rows={2} {...register('heroHeadlineAr')} dir="rtl" disabled={busy} />}
            </Field>
          </div>
          <div className="admin-form__row">
            <Field label={t('Sub-text (English)', 'نص فرعي (إنجليزي)')}>
              {(p) => <Textarea {...p} rows={2} {...register('heroLedeEn')} disabled={busy} />}
            </Field>
            <Field label={t('Sub-text (Arabic)', 'نص فرعي (عربي)')}>
              {(p) => <Textarea {...p} rows={2} {...register('heroLedeAr')} dir="rtl" disabled={busy} />}
            </Field>
          </div>
          <div className="admin-form__row">
            <Field label={t('Button label (English)', 'نص الزر (إنجليزي)')}>
              {(p) => <Input {...p} {...register('heroCtaLabelEn')} disabled={busy} />}
            </Field>
            <Field label={t('Button label (Arabic)', 'نص الزر (عربي)')}>
              {(p) => <Input {...p} {...register('heroCtaLabelAr')} dir="rtl" disabled={busy} />}
            </Field>
          </div>
          <Field
            label={t('Button links to', 'الزر يفتح')}
            hint={t('Leave as "First nav collection" to follow the nav automatically', 'اتركه على "أول مجموعة في التنقل" ليتبع التنقل تلقائيًا')}
          >
            {(p) => (
              <Select {...p} {...register('heroCtaCollectionId')} disabled={busy}>
                <option value="">{t('First nav collection', 'أول مجموعة في التنقل')}</option>
                {(collections ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {isAr ? c.nameAr : c.nameEn}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="admin-form__row">
            <Field label={t('"More to explore" heading (English)', 'عنوان "المزيد لاكتشافه" (إنجليزي)')}>
              {(p) => <Input {...p} {...register('homeMoreHeadingEn')} disabled={busy} />}
            </Field>
            <Field label={t('"More to explore" heading (Arabic)', 'عنوان "المزيد لاكتشافه" (عربي)')}>
              {(p) => <Input {...p} {...register('homeMoreHeadingAr')} dir="rtl" disabled={busy} />}
            </Field>
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {saved && <Alert tone="success">{t('Settings saved.', 'تم حفظ الإعدادات.')}</Alert>}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Save settings', 'حفظ الإعدادات')}
          </Button>
        </div>
      </form>

      <div style={{ marginTop: 'var(--space-7)' }}>
        <CurationPanel locale={locale} />
      </div>
    </div>
  );
}
