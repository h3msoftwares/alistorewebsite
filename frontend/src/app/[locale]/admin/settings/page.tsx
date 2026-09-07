'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useFieldArray, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, Trash2 } from 'lucide-react';
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
import { DELIVERY_REGIONS } from '@/lib/regions';
import type { SiteSettingsBody } from '@/lib/types';
import { CurationPanel } from './curation-panel';
import { NotificationsPanel } from './notifications-panel';

// http(s) only — these render as `<a href>` in the storefront footer, so a
// `javascript:` / `data:` value would be stored XSS. Mirrors the API's
// `httpUrl` guard so the form fails fast with a clear message.
const urlOrEmpty = z
  .string()
  .trim()
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Must be a full URL (https://…)' }
  )
  .or(z.literal(''));

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
  // ---- Delivery fees ----
  deliveryFeeEnabled: z.boolean(),
  deliveryFeeFlat: z.number({ message: 'Enter a number' }).min(0, 'Must be 0 or more'),
  // Blank ⇒ no free-over-threshold rule.
  freeDeliveryThreshold: z
    .string()
    .trim()
    .refine((v) => v === '' || Number(v) >= 0, 'Must be 0 or more'),
  freeDeliveryRegions: z.array(z.string()),
  deliveryRates: z
    .array(
      z.object({
        region: z.string().min(1, 'Pick a governorate'),
        fee: z.number({ message: 'Enter a number' }).min(0, 'Must be 0 or more'),
      })
    )
    .max(DELIVERY_REGIONS.length)
    .superRefine((rates, ctx) => {
      const seen = new Set<string>();
      rates.forEach((r, i) => {
        if (r.region && seen.has(r.region)) {
          ctx.addIssue({ code: 'custom', path: [i, 'region'], message: 'Already listed' });
        }
        seen.add(r.region);
      });
    }),
});
type SettingsForm = z.infer<typeof settingsFormSchema>;

const blankLine = { textEn: '', textAr: '' };
const blankRate = { region: '', fee: 0 };

// The settings page is one long form; these are its sections, surfaced as tabs
// for navigation and as the unit the search box filters. `terms` is extra
// searchable text (field labels, synonyms, both languages) so a query like
// "shipping" or "واتساب" lands on the right tab.
type TabId = 'brand' | 'announcement' | 'hero' | 'delivery' | 'curation' | 'notifications';

const SECTIONS: { id: TabId; en: string; ar: string; terms: string }[] = [
  {
    id: 'brand',
    en: 'Brand & contact',
    ar: 'العلامة والتواصل',
    terms:
      'brand name store title contact email phone number instagram facebook tiktok whatsapp social links footer ' +
      'العلامة اسم المتجر بريد إلكتروني هاتف رقم تواصل انستغرام فيسبوك تيك توك واتساب روابط التواصل',
  },
  {
    id: 'announcement',
    en: 'Announcement strip',
    ar: 'شريط الإعلانات',
    terms:
      'announcement strip banner top bar rotating lines message notice promo ' +
      'شريط الإعلانات لافتة أعلى الصفحة رسالة تنبيه عرض سطور متناوبة',
  },
  {
    id: 'hero',
    en: 'Home hero',
    ar: 'واجهة الرئيسية',
    terms:
      'home hero landing headline eyebrow sub-text subtext lede button label cta links to more to explore heading ' +
      'الرئيسية واجهة عنوان رئيسي تمهيد نص فرعي زر تسمية يفتح المزيد لاكتشافه',
  },
  {
    id: 'delivery',
    en: 'Delivery fees',
    ar: 'رسوم التوصيل',
    terms:
      'delivery fee shipping cost flat fee free over threshold governorate region per-governorate rate free delivery regions ' +
      'رسوم التوصيل شحن تكلفة ثابتة مجاني فوق حد محافظة سعر لكل محافظة مناطق التوصيل المجاني',
  },
  {
    id: 'curation',
    en: 'Navigation & home',
    ar: 'التنقل والرئيسية',
    terms:
      'navigation nav menu top nav home page featured collections categories sort order show on home in nav curation ' +
      'التنقل القائمة الرئيسية المميزة المجموعات الفئات ترتيب العرض إظهار في الرئيسية في التنقل',
  },
  {
    id: 'notifications',
    en: 'Notifications',
    ar: 'الإشعارات',
    terms:
      'notifications push order alert alerts enable device browser web push ' +
      'إشعارات فورية تنبيه طلب تفعيل جهاز متصفح',
  },
];

function sectionMatches(s: (typeof SECTIONS)[number], query: string): boolean {
  const hay = `${s.en} ${s.ar} ${s.terms}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
}

// Which tab a validation error belongs to, so a failed save jumps there
// instead of silently doing nothing when the offending field is on a hidden tab.
function tabForErrorKey(key: string): TabId {
  if (key.startsWith('hero') || key.startsWith('homeMore')) return 'hero';
  if (key.startsWith('announcement')) return 'announcement';
  if (key.startsWith('delivery') || key.startsWith('freeDelivery')) return 'delivery';
  return 'brand';
}

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
  const [tab, setTab] = useState<TabId>('brand');
  const [q, setQ] = useState('');

  const searching = q.trim().length > 0;
  const matchedIds = new Set(
    searching ? SECTIONS.filter((s) => sectionMatches(s, q.trim())).map((s) => s.id) : []
  );
  const shows = (id: TabId) => (searching ? matchedIds.has(id) : tab === id);
  const anyFormSectionVisible = (['brand', 'announcement', 'hero', 'delivery'] as const).some(shows);

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
    deliveryFeeEnabled: settings.deliveryFeeEnabled,
    deliveryFeeFlat: Number(settings.deliveryFeeFlat ?? 0),
    freeDeliveryThreshold:
      settings.freeDeliveryThreshold == null ? '' : String(Number(settings.freeDeliveryThreshold)),
    freeDeliveryRegions: settings.freeDeliveryRegions ?? [],
    deliveryRates: settings.deliveryRates.map((r) => ({ region: r.region, fee: Number(r.fee) })),
  };

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsForm>({ resolver: zodResolver(settingsFormSchema), values });
  const { fields, append, remove } = useFieldArray({ control, name: 'announcementLines' });
  const rates = useFieldArray({ control, name: 'deliveryRates' });

  const busy = updateSettings.isPending;

  const onInvalid = (errs: FieldErrors<SettingsForm>) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    setQ('');
    setTab(tabForErrorKey(first));
  };

  const onSubmit = async (form: SettingsForm) => {
    setError(null);
    setSaved(false);
    try {
      const { freeDeliveryThreshold, ...rest } = form;
      const payload: SiteSettingsBody = {
        ...rest,
        freeDeliveryThreshold:
          freeDeliveryThreshold.trim() === '' ? null : Number(freeDeliveryThreshold),
      };
      await updateSettings.mutateAsync(payload);
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
        <span className="admin-list-controls__search settings-search">
          <Icon as={Search} size={16} />
          <input
            type="search"
            className="input"
            placeholder={t('Search settings…', 'ابحث في الإعدادات…')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('Search settings', 'ابحث في الإعدادات')}
          />
        </span>
      </div>

      <nav className="admin-nav settings-tabs" aria-label={t('Settings sections', 'أقسام الإعدادات')}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="admin-nav__link"
            data-active={!searching && tab === s.id ? '' : undefined}
            aria-pressed={!searching && tab === s.id}
            hidden={searching && !matchedIds.has(s.id)}
            onClick={() => {
              setQ('');
              setTab(s.id);
            }}
          >
            {isAr ? s.ar : s.en}
          </button>
        ))}
      </nav>

      {searching && matchedIds.size === 0 && (
        <p className="admin-form__hint">
          {t('No settings match', 'لا توجد إعدادات مطابقة')} “{q.trim()}”.
        </p>
      )}

      <form
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        noValidate
        className="admin-form"
        hidden={!anyFormSectionVisible}
      >
        {/* ---- Brand & contact ---- */}
        <section className="admin-form__section" id="set-brand" hidden={!shows('brand')}>
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
        </section>

        {/* ---- Announcement strip ---- */}
        <div className="admin-form__section" id="set-announcement" hidden={!shows('announcement')}>
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
        <div className="admin-form__section" id="set-hero" hidden={!shows('hero')}>
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

        {/* ---- Delivery fees ---- */}
        <div className="admin-form__section" id="set-delivery" hidden={!shows('delivery')}>
          <p className="admin-form__section-title">{t('Delivery fees', 'رسوم التوصيل')}</p>
          <Choice
            type="checkbox"
            label={t('Charge a delivery fee', 'فرض رسوم توصيل')}
            {...register('deliveryFeeEnabled')}
            disabled={busy}
          />
          <p className="admin-form__hint">
            {t(
              'Off ⇒ every order ships free. The flat fee applies to any governorate without its own rate below.',
              'إيقاف ⇒ التوصيل مجاني لكل الطلبات. تُطبَّق الرسوم الثابتة على أي محافظة ليس لها سعر خاص أدناه.'
            )}
          </p>
          <div className="admin-form__row">
            <Field label={t('Flat fee ($)', 'الرسوم الثابتة ($)')} error={errors.deliveryFeeFlat?.message}>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  step="0.01"
                  {...register('deliveryFeeFlat', { valueAsNumber: true })}
                  disabled={busy}
                />
              )}
            </Field>
            <Field
              label={t('Free over ($)', 'مجاني فوق ($)')}
              hint={t('Blank ⇒ no free-delivery threshold', 'فارغ ⇒ لا يوجد حد للتوصيل المجاني')}
              error={errors.freeDeliveryThreshold?.message}
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={t('e.g. 50', 'مثال: 50')}
                  {...register('freeDeliveryThreshold')}
                  disabled={busy}
                />
              )}
            </Field>
          </div>

          <p className="admin-form__hint">{t('Per-governorate rate (overrides the flat fee)', 'سعر لكل محافظة (يتجاوز الرسوم الثابتة)')}</p>
          {rates.fields.map((field, i) => (
            <div key={field.id} className="admin-variant-row">
              <Field label={t('Governorate', 'المحافظة')} error={errors.deliveryRates?.[i]?.region?.message}>
                {(p) => (
                  <Select {...p} {...register(`deliveryRates.${i}.region` as const)} disabled={busy}>
                    <option value="">{t('Pick one', 'اختر')}</option>
                    {DELIVERY_REGIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {isAr ? r.ar : r.en}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('Fee ($)', 'الرسوم ($)')} error={errors.deliveryRates?.[i]?.fee?.message}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    step="0.01"
                    {...register(`deliveryRates.${i}.fee` as const, { valueAsNumber: true })}
                    disabled={busy}
                  />
                )}
              </Field>
              <button
                type="button"
                className="icon-btn icon-btn--bordered admin-variant-row__remove"
                onClick={() => rates.remove(i)}
                disabled={busy}
                aria-label={t('Remove rate', 'حذف السعر')}
              >
                <Icon as={Trash2} size={16} />
              </button>
            </div>
          ))}
          {rates.fields.length < DELIVERY_REGIONS.length && (
            <Button type="button" variant="outline" onClick={() => rates.append(blankRate)} disabled={busy}>
              <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
              {t('Add governorate rate', 'إضافة سعر محافظة')}
            </Button>
          )}

          <p className="admin-form__hint" style={{ marginBlockStart: 'var(--space-4)' }}>
            {t('Free delivery to these governorates', 'توصيل مجاني إلى هذه المحافظات')}
          </p>
          <div className="admin-form__checks">
            {DELIVERY_REGIONS.map((r) => (
              <Choice
                key={r.value}
                type="checkbox"
                value={r.value}
                label={isAr ? r.ar : r.en}
                {...register('freeDeliveryRegions')}
                disabled={busy}
              />
            ))}
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

      <div id="set-curation" hidden={!shows('curation')} style={{ marginTop: 'var(--space-6)' }}>
        <CurationPanel locale={locale} />
      </div>

      <div id="set-notifications" hidden={!shows('notifications')} style={{ marginTop: 'var(--space-6)' }}>
        <NotificationsPanel locale={locale} />
      </div>
    </div>
  );
}
