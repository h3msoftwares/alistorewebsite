'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useFieldArray, useForm, useWatch, type FieldErrors } from 'react-hook-form';
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
import { ImageUploader } from '@/components/admin/image-uploader';
import { DELIVERY_REGIONS } from '@/lib/regions';
import type { SiteSettingsBody } from '@/lib/types';
import { CurationPanel } from './curation-panel';
import { NotificationsPanel } from './notifications-panel';

// Admin-side day labels for the opening-hours editor. Index 0 = Monday … 6 =
// Sunday, matching StoreHours.dayOfWeek and its storefront render order.
const HOURS_DAYS: { en: string; ar: string }[] = [
  { en: 'Monday', ar: 'الإثنين' },
  { en: 'Tuesday', ar: 'الثلاثاء' },
  { en: 'Wednesday', ar: 'الأربعاء' },
  { en: 'Thursday', ar: 'الخميس' },
  { en: 'Friday', ar: 'الجمعة' },
  { en: 'Saturday', ar: 'السبت' },
  { en: 'Sunday', ar: 'الأحد' },
];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  mailFromName: z.string().trim().max(120),
  mailFromEmail: z.string().trim().email('Must be an email').or(z.literal('')),
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
  // ---- Our story page ----
  storyTitleEn: z.string().trim().max(120),
  storyTitleAr: z.string().trim().max(120),
  storyBodyEn: z.string().trim().max(8000),
  storyBodyAr: z.string().trim().max(8000),
  storyImageUrl: z.string(), // set by the uploader; '' = no image
  storyImageFileId: z.string(),
  // ---- Customer review images ----
  reviewImages: z
    .array(z.object({ imageUrl: z.string().min(1, 'Upload an image'), imageFileId: z.string() }))
    .max(30),
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
        region: z.string().trim().min(1, 'Name this region').max(60),
        fee: z.number({ message: 'Enter a number' }).min(0, 'Must be 0 or more'),
      })
    )
    .max(40)
    .superRefine((rates, ctx) => {
      const seen = new Set<string>();
      rates.forEach((r, i) => {
        if (r.region && seen.has(r.region)) {
          ctx.addIssue({ code: 'custom', path: [i, 'region'], message: 'Already listed' });
        }
        seen.add(r.region);
      });
    }),
  // ---- Store locations ("Visit us" section) ----
  // Each location always carries 7 hour rows (Mon…Sun); `closed` days are
  // dropped on submit.
  storeLocations: z
    .array(
      z.object({
        nameEn: z.string().trim().max(80),
        nameAr: z.string().trim().max(80),
        addressEn: z.string().trim().max(300),
        addressAr: z.string().trim().max(300),
        mapUrl: urlOrEmpty,
        imageUrl: z.string(), // set by the uploader; '' = no image
        imageFileId: z.string(),
        hours: z
          .array(
            z.object({
              dayOfWeek: z.number(),
              closed: z.boolean(),
              opensAt: z.string(),
              closesAt: z.string(),
            })
          )
          .length(7)
          .superRefine((rows, ctx) => {
            rows.forEach((r, i) => {
              if (r.closed) return;
              const okOpen = HHMM.test(r.opensAt);
              const okClose = HHMM.test(r.closesAt);
              if (!okOpen) ctx.addIssue({ code: 'custom', path: [i, 'opensAt'], message: 'Set a time' });
              if (!okClose) ctx.addIssue({ code: 'custom', path: [i, 'closesAt'], message: 'Set a time' });
              if (okOpen && okClose && r.closesAt <= r.opensAt) {
                ctx.addIssue({ code: 'custom', path: [i, 'closesAt'], message: 'Must be after opening' });
              }
            });
          }),
      })
    )
    .max(20),
});
type SettingsForm = z.infer<typeof settingsFormSchema>;

const blankLine = { textEn: '', textAr: '' };
const blankRate = { region: '', fee: 0 };
const blankLocation = {
  nameEn: '',
  nameAr: '',
  addressEn: '',
  addressAr: '',
  mapUrl: '',
  imageUrl: '',
  imageFileId: '',
  hours: HOURS_DAYS.map((_, day) => ({ dayOfWeek: day, closed: true, opensAt: '', closesAt: '' })),
};

// The settings page is one long form; these are its sections, surfaced as tabs
// for navigation and as the unit the search box filters. `terms` is extra
// searchable text (field labels, synonyms, both languages) so a query like
// "shipping" or "واتساب" lands on the right tab.
type TabId =
  | 'brand'
  | 'announcement'
  | 'hero'
  | 'delivery'
  | 'storeinfo'
  | 'story'
  | 'reviews'
  | 'curation'
  | 'notifications';

const SECTIONS: { id: TabId; en: string; ar: string; terms: string }[] = [
  {
    id: 'brand',
    en: 'Brand & contact',
    ar: 'العلامة والتواصل',
    terms:
      'brand name store title contact email phone number instagram facebook tiktok whatsapp social links footer ' +
      'outgoing email sender from address smtp notification emails ' +
      'العلامة اسم المتجر بريد إلكتروني هاتف رقم تواصل انستغرام فيسبوك تيك توك واتساب روابط التواصل ' +
      'بريد المرسل عنوان الإرسال',
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
    id: 'storeinfo',
    en: 'Store locations',
    ar: 'مواقع المتاجر',
    terms:
      'store locations branches location address map directions google maps opening hours working days times schedule visit us background image ' +
      'مواقع المتاجر الفروع الموقع العنوان خريطة الاتجاهات ساعات العمل أيام الدوام المواعيد الجدول زورونا صورة الخلفية',
  },
  {
    id: 'story',
    en: 'Our story page',
    ar: 'صفحة قصتنا',
    terms:
      'our story page about us history brand narrative mission optional content page ' +
      'قصتنا صفحة من نحن عن المتجر تاريخ العلامة رسالة صفحة اختيارية محتوى',
  },
  {
    id: 'reviews',
    en: 'Customer reviews',
    ar: 'آراء العملاء',
    terms:
      'customer reviews testimonials screenshots review images social proof home page strip ratings feedback ' +
      'آراء العملاء شهادات لقطات شاشة صور المراجعات دليل اجتماعي شريط الصفحة الرئيسية تقييمات',
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
  if (key.startsWith('store')) return 'storeinfo';
  if (key.startsWith('story')) return 'story';
  if (key.startsWith('review')) return 'reviews';
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
  const anyFormSectionVisible = (
    ['brand', 'announcement', 'hero', 'delivery', 'storeinfo', 'story', 'reviews'] as const
  ).some(shows);

  const values: SettingsForm | undefined = settings && {
    brandNameEn: settings.brandNameEn,
    brandNameAr: settings.brandNameAr,
    contactEmail: settings.contactEmail ?? '',
    contactPhone: settings.contactPhone ?? '',
    mailFromName: settings.mailFromName ?? '',
    mailFromEmail: settings.mailFromEmail ?? '',
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
    storyTitleEn: settings.storyTitleEn ?? '',
    storyTitleAr: settings.storyTitleAr ?? '',
    storyBodyEn: settings.storyBodyEn ?? '',
    storyBodyAr: settings.storyBodyAr ?? '',
    storyImageUrl: settings.storyImageUrl ?? '',
    storyImageFileId: settings.storyImageFileId ?? '',
    reviewImages: (settings.reviewImages ?? []).map((r) => ({
      imageUrl: r.imageUrl,
      imageFileId: r.imageFileId ?? '',
    })),
    deliveryFeeEnabled: settings.deliveryFeeEnabled,
    deliveryFeeFlat: Number(settings.deliveryFeeFlat ?? 0),
    freeDeliveryThreshold:
      settings.freeDeliveryThreshold == null ? '' : String(Number(settings.freeDeliveryThreshold)),
    freeDeliveryRegions: settings.freeDeliveryRegions ?? [],
    deliveryRates: settings.deliveryRates.map((r) => ({ region: r.region, fee: Number(r.fee) })),
    storeLocations: (settings.storeLocations ?? []).map((loc) => ({
      nameEn: loc.nameEn ?? '',
      nameAr: loc.nameAr ?? '',
      addressEn: loc.addressEn ?? '',
      addressAr: loc.addressAr ?? '',
      mapUrl: loc.mapUrl ?? '',
      imageUrl: loc.imageUrl ?? '',
      imageFileId: loc.imageFileId ?? '',
      hours: HOURS_DAYS.map((_, day) => {
        const h = loc.hours.find((x) => x.dayOfWeek === day);
        return h
          ? { dayOfWeek: day, closed: false, opensAt: h.opensAt, closesAt: h.closesAt }
          : { dayOfWeek: day, closed: true, opensAt: '', closesAt: '' };
      }),
    })),
  };

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SettingsForm>({ resolver: zodResolver(settingsFormSchema), values });
  const { fields, append, remove } = useFieldArray({ control, name: 'announcementLines' });
  const rates = useFieldArray({ control, name: 'deliveryRates' });
  const locations = useFieldArray({ control, name: 'storeLocations' });
  const reviews = useFieldArray({ control, name: 'reviewImages' });
  const watchedReviews = useWatch({ control, name: 'reviewImages' }) ?? [];
  const storyImageUrl = useWatch({ control, name: 'storyImageUrl' });
  const setStoryImage = (url: string, fileId: string) => {
    setValue('storyImageUrl', url, { shouldDirty: true });
    setValue('storyImageFileId', fileId, { shouldDirty: true });
  };

  // Store locations: watched for the per-card image preview and per-day
  // "closed" state (which drives whether the time inputs are enabled).
  const watchedLocations = useWatch({ control, name: 'storeLocations' }) ?? [];
  const setLocationImage = (i: number, url: string, fileId: string) => {
    setValue(`storeLocations.${i}.imageUrl`, url, { shouldDirty: true });
    setValue(`storeLocations.${i}.imageFileId`, fileId, { shouldDirty: true });
  };

  // Free-delivery checkboxes: the built-in governorates plus any custom zone
  // the admin has added a rate row for.
  const watchedRates = useWatch({ control, name: 'deliveryRates' }) ?? [];
  const builtinValues = new Set<string>(DELIVERY_REGIONS.map((r) => r.value));
  const freeRegionOptions = [
    ...DELIVERY_REGIONS.map((r) => ({ value: r.value, label: isAr ? r.ar : r.en })),
    ...watchedRates
      .map((r) => r?.region?.trim())
      .filter((v): v is string => Boolean(v) && !builtinValues.has(v))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((v) => ({ value: v, label: v })),
  ];

  // Controlled checkbox group: RHF's uncontrolled array-of-checkboxes pattern
  // doesn't round-trip cleanly through `useForm({ values })`, so drive it by hand.
  const freeRegions = useWatch({ control, name: 'freeDeliveryRegions' }) ?? [];
  const toggleFreeRegion = (value: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...freeRegions, value])]
      : freeRegions.filter((v) => v !== value);
    setValue('freeDeliveryRegions', next, { shouldDirty: true });
  };

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
      const { freeDeliveryThreshold, storeLocations, reviewImages, ...rest } = form;
      const payload: SiteSettingsBody = {
        ...rest,
        freeDeliveryThreshold:
          freeDeliveryThreshold.trim() === '' ? null : Number(freeDeliveryThreshold),
        // Replace-all: the whole review strip, in order. Rows without an image
        // (shouldn't happen — the uploader sets it) are dropped.
        reviewImages: reviewImages
          .filter((r) => r.imageUrl.trim() !== '')
          .map((r) => ({ imageUrl: r.imageUrl, imageFileId: r.imageFileId })),
        // Replace-all: the whole set of stores. Per location, only the open
        // days survive; anything else is "Closed".
        storeLocations: storeLocations.map((loc) => ({
          nameEn: loc.nameEn,
          nameAr: loc.nameAr,
          addressEn: loc.addressEn,
          addressAr: loc.addressAr,
          mapUrl: loc.mapUrl,
          imageUrl: loc.imageUrl,
          imageFileId: loc.imageFileId,
          hours: loc.hours
            .filter((r) => !r.closed && HHMM.test(r.opensAt) && HHMM.test(r.closesAt))
            .map((r) => ({ dayOfWeek: r.dayOfWeek, opensAt: r.opensAt, closesAt: r.closesAt })),
        })),
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
          <Field
            label={t('Outgoing email name', 'اسم مرسِل البريد')}
            hint={t('Shown as the sender name, e.g. "Ali’s Store"', 'يظهر كاسم المرسل، مثل "متجر علي"')}
            error={errors.mailFromName?.message}
          >
            {(p) => <Input {...p} {...register('mailFromName')} placeholder="Ali's Store" disabled={busy} />}
          </Field>
          <Field
            label={t('Outgoing email address', 'عنوان بريد الإرسال')}
            hint={t(
              'Replaces SMTP_FROM. Must be an address your email provider lets you send from.',
              'يحل محل SMTP_FROM. يجب أن يكون عنوانًا يسمح مزوّد البريد بالإرسال منه.'
            )}
            error={errors.mailFromEmail?.message}
          >
            {(p) => <Input {...p} type="email" {...register('mailFromEmail')} disabled={busy} />}
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

          <p className="admin-form__hint">
            {t(
              'Per-region rate (overrides the flat fee). Pick a governorate or type a custom zone name (e.g. a remote town, or "Outside Lebanon").',
              'سعر لكل منطقة (يتجاوز الرسوم الثابتة). اختر محافظة أو اكتب اسم منطقة خاصة (مثل بلدة نائية أو "خارج لبنان").'
            )}
          </p>
          <datalist id="delivery-region-suggestions">
            {DELIVERY_REGIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {isAr ? r.ar : r.en}
              </option>
            ))}
          </datalist>
          {rates.fields.map((field, i) => (
            <div key={field.id} className="admin-variant-row">
              <Field label={t('Region', 'المنطقة')} error={errors.deliveryRates?.[i]?.region?.message}>
                {(p) => (
                  <Input
                    {...p}
                    list="delivery-region-suggestions"
                    placeholder={t('Governorate or custom zone', 'محافظة أو منطقة خاصة')}
                    {...register(`deliveryRates.${i}.region` as const)}
                    disabled={busy}
                  />
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
          {rates.fields.length < 40 && (
            <Button type="button" variant="outline" onClick={() => rates.append(blankRate)} disabled={busy}>
              <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
              {t('Add region rate', 'إضافة سعر منطقة')}
            </Button>
          )}

          <p className="admin-form__hint" style={{ marginBlockStart: 'var(--space-4)' }}>
            {t('Free delivery to these regions', 'توصيل مجاني إلى هذه المناطق')}
          </p>
          <div className="admin-form__checks">
            {freeRegionOptions.map((r) => (
              <Choice
                key={r.value}
                type="checkbox"
                label={r.label}
                checked={freeRegions.includes(r.value)}
                onChange={(e) => toggleFreeRegion(r.value, e.target.checked)}
                disabled={busy}
              />
            ))}
          </div>
        </div>

        {/* ---- Store locations ("Visit us" section) ---- */}
        <div className="admin-form__section" id="set-storeinfo" hidden={!shows('storeinfo')}>
          <p className="admin-form__section-title">{t('Store locations', 'مواقع المتاجر')}</p>
          <p className="admin-form__hint">
            {t(
              'Each location shows as a card in the "Visit us" section near the bottom of the home page. With no locations added, that section is hidden.',
              'يظهر كل موقع كبطاقة في قسم "زورونا" قرب أسفل الصفحة الرئيسية. إذا لم تُضف أي موقع، يُخفى هذا القسم.'
            )}
          </p>

          {locations.fields.map((field, i) => {
            const loc = watchedLocations[i];
            return (
              <div
                key={field.id}
                className="admin-form__section"
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                }}
              >
                <div className="admin-page__head">
                  <p className="admin-form__section-title" style={{ margin: 0 }}>
                    {t('Location', 'الموقع')} {i + 1}
                  </p>
                  <button
                    type="button"
                    className="icon-btn icon-btn--bordered"
                    onClick={() => locations.remove(i)}
                    disabled={busy}
                    aria-label={t('Remove location', 'حذف الموقع')}
                  >
                    <Icon as={Trash2} size={16} />
                  </button>
                </div>

                <div className="admin-form__row">
                  <Field
                    label={t('Name (English)', 'الاسم (إنجليزي)')}
                    hint={t('e.g. "Hamra branch" — optional', 'مثال: "فرع الحمرا" — اختياري')}
                    error={errors.storeLocations?.[i]?.nameEn?.message}
                  >
                    {(p) => <Input {...p} {...register(`storeLocations.${i}.nameEn` as const)} disabled={busy} />}
                  </Field>
                  <Field label={t('Name (Arabic)', 'الاسم (عربي)')} error={errors.storeLocations?.[i]?.nameAr?.message}>
                    {(p) => (
                      <Input {...p} dir="rtl" {...register(`storeLocations.${i}.nameAr` as const)} disabled={busy} />
                    )}
                  </Field>
                </div>

                <div className="admin-form__row">
                  <Field label={t('Address (English)', 'العنوان (إنجليزي)')} error={errors.storeLocations?.[i]?.addressEn?.message}>
                    {(p) => (
                      <Textarea {...p} rows={3} {...register(`storeLocations.${i}.addressEn` as const)} disabled={busy} />
                    )}
                  </Field>
                  <Field label={t('Address (Arabic)', 'العنوان (عربي)')} error={errors.storeLocations?.[i]?.addressAr?.message}>
                    {(p) => (
                      <Textarea
                        {...p}
                        rows={3}
                        dir="rtl"
                        {...register(`storeLocations.${i}.addressAr` as const)}
                        disabled={busy}
                      />
                    )}
                  </Field>
                </div>

                <Field
                  label={t('Map link', 'رابط الخريطة')}
                  hint={t('Full URL (Google Maps, etc.), or blank to hide "Get directions"', 'رابط كامل (خرائط Google مثلًا)، أو فارغ لإخفاء "الاتجاهات"')}
                  error={errors.storeLocations?.[i]?.mapUrl?.message}
                >
                  {(p) => (
                    <Input
                      {...p}
                      type="url"
                      placeholder="https://maps.google.com/…"
                      {...register(`storeLocations.${i}.mapUrl` as const)}
                      disabled={busy}
                    />
                  )}
                </Field>

                <p className="admin-form__hint" style={{ marginBlockStart: 'var(--space-4)' }}>
                  {t('Background image (optional)', 'صورة الخلفية (اختياري)')}
                </p>
                {loc?.imageUrl ? (
                  <div className="admin-variant-row" style={{ alignItems: 'center' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={loc.imageUrl}
                      alt=""
                      style={{ width: 120, height: 72, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                    />
                    <Button type="button" variant="outline" onClick={() => setLocationImage(i, '', '')} disabled={busy}>
                      {t('Remove image', 'إزالة الصورة')}
                    </Button>
                  </div>
                ) : (
                  <ImageUploader
                    folder="/site"
                    locale={locale}
                    disabled={busy}
                    onUploaded={(img) => setLocationImage(i, img.url, img.fileId)}
                  />
                )}

                <p className="admin-form__hint" style={{ marginBlockStart: 'var(--space-4)' }}>
                  {t('Opening hours', 'ساعات العمل')}
                </p>
                {HOURS_DAYS.map((d, day) => {
                  const closed = loc?.hours?.[day]?.closed ?? false;
                  return (
                    <div key={day} className="admin-variant-row" style={{ alignItems: 'center' }}>
                      <span style={{ minWidth: '6rem', fontWeight: 'var(--fw-medium)' }}>{isAr ? d.ar : d.en}</span>
                      <Choice
                        type="checkbox"
                        label={t('Closed', 'مغلق')}
                        {...register(`storeLocations.${i}.hours.${day}.closed` as const)}
                        disabled={busy}
                      />
                      <Field label={t('Opens', 'يفتح')} error={errors.storeLocations?.[i]?.hours?.[day]?.opensAt?.message}>
                        {(p) => (
                          <Input
                            {...p}
                            type="time"
                            {...register(`storeLocations.${i}.hours.${day}.opensAt` as const)}
                            disabled={busy || closed}
                          />
                        )}
                      </Field>
                      <Field label={t('Closes', 'يغلق')} error={errors.storeLocations?.[i]?.hours?.[day]?.closesAt?.message}>
                        {(p) => (
                          <Input
                            {...p}
                            type="time"
                            {...register(`storeLocations.${i}.hours.${day}.closesAt` as const)}
                            disabled={busy || closed}
                          />
                        )}
                      </Field>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {locations.fields.length < 20 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => locations.append(blankLocation)}
              disabled={busy}
            >
              <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
              {t('Add location', 'إضافة موقع')}
            </Button>
          )}
        </div>

        {/* ---- Our story page ---- */}
        <div className="admin-form__section" id="set-story" hidden={!shows('story')}>
          <p className="admin-form__section-title">{t('Our story page', 'صفحة قصتنا')}</p>
          <p className="admin-form__hint">
            {t(
              'Optional. Fill in a title and body to publish a "/our-story" page and show its link in the footer. Leave both bodies blank to hide it. Separate paragraphs with a blank line.',
              'اختياري. أدخل عنوانًا ونصًا لنشر صفحة "/our-story" وإظهار رابطها في التذييل. اترك النصين فارغين لإخفائها. افصل الفقرات بسطر فارغ.'
            )}
          </p>
          <div className="admin-form__row">
            <Field label={t('Title (English)', 'العنوان (إنجليزي)')} error={errors.storyTitleEn?.message}>
              {(p) => <Input {...p} {...register('storyTitleEn')} disabled={busy} />}
            </Field>
            <Field label={t('Title (Arabic)', 'العنوان (عربي)')} error={errors.storyTitleAr?.message}>
              {(p) => <Input {...p} dir="rtl" {...register('storyTitleAr')} disabled={busy} />}
            </Field>
          </div>
          <div className="admin-form__row">
            <Field label={t('Body (English)', 'النص (إنجليزي)')} error={errors.storyBodyEn?.message}>
              {(p) => <Textarea {...p} rows={8} {...register('storyBodyEn')} disabled={busy} />}
            </Field>
            <Field label={t('Body (Arabic)', 'النص (عربي)')} error={errors.storyBodyAr?.message}>
              {(p) => <Textarea {...p} rows={8} dir="rtl" {...register('storyBodyAr')} disabled={busy} />}
            </Field>
          </div>

          <p className="admin-form__hint" style={{ marginBlockStart: 'var(--space-4)' }}>
            {t('Image (optional) — shown beside the text', 'صورة (اختياري) — تظهر بجانب النص')}
          </p>
          {storyImageUrl ? (
            <div className="admin-variant-row" style={{ alignItems: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={storyImageUrl}
                alt=""
                style={{ width: 140, height: 90, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
              />
              <Button type="button" variant="outline" onClick={() => setStoryImage('', '')} disabled={busy}>
                {t('Remove image', 'إزالة الصورة')}
              </Button>
            </div>
          ) : (
            <ImageUploader
              folder="/site/story"
              locale={locale}
              disabled={busy}
              onUploaded={(img) => setStoryImage(img.url, img.fileId)}
            />
          )}
        </div>

        {/* ---- Customer reviews ---- */}
        <div className="admin-form__section" id="set-reviews" hidden={!shows('reviews')}>
          <p className="admin-form__section-title">{t('Customer reviews', 'آراء العملاء')}</p>
          <p className="admin-form__hint">
            {t(
              'Upload screenshots of customer reviews. They show as a horizontal strip on the home page under "Visit us", in this order. With none added, the strip is hidden.',
              'ارفع لقطات شاشة لآراء العملاء. تظهر كشريط أفقي في الصفحة الرئيسية تحت "زورونا"، بهذا الترتيب. إذا لم تُضف أي صورة، يُخفى الشريط.'
            )}
          </p>

          <div className="admin-form__checks">
            {reviews.fields.map((field, i) => {
              const url = watchedReviews[i]?.imageUrl;
              return (
                <div key={field.id} className="admin-variant-row" style={{ alignItems: 'center' }}>
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt=""
                      style={{
                        width: 96,
                        height: 120,
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border)',
                      }}
                    />
                  ) : (
                    <span className="admin-thumb admin-thumb--empty" aria-hidden />
                  )}
                  <button
                    type="button"
                    className="icon-btn icon-btn--bordered"
                    onClick={() => reviews.remove(i)}
                    disabled={busy}
                    aria-label={t('Remove review image', 'حذف صورة المراجعة')}
                  >
                    <Icon as={Trash2} size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          {reviews.fields.length < 30 && (
            <ImageUploader
              folder="/site/reviews"
              locale={locale}
              disabled={busy}
              onUploaded={(img) => reviews.append({ imageUrl: img.url, imageFileId: img.fileId })}
            />
          )}
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
