'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSettings } from '@/hooks/use-settings';
import { useNavCollections } from '@/hooks/use-catalog';

/**
 * Home hero: a full-bleed near-black band (== --color-secondary) filling the
 * first screenful, with the brand illustration centred in the middle and the
 * editorial copy split to either side — eyebrow + headline at the inline-start,
 * lede + Discover CTA at the inline-end. Light text on the dark field; a
 * deliberate dark band, not a dark-mode toggle. The illustration is a
 * transparent PNG so it sits directly on the band with no visible frame.
 *
 * Copy + the CTA target come from the admin's site settings
 * (`GET /api/settings`), falling back to the shipped defaults while that
 * loads. The image lives at `frontend/public/home-hero-bg.png` (referenced by
 * path, not a static import, so a missing asset doesn't break the build).
 */
export function Hero({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: settings } = useSettings();
  const { data: navCollections } = useNavCollections();

  const eyebrow = settings
    ? isAr
      ? settings.heroEyebrowAr
      : settings.heroEyebrowEn
    : t('Limited stock', 'كمية محدودة');
  const headline = settings
    ? isAr
      ? settings.heroHeadlineAr
      : settings.heroHeadlineEn
    : t('Buy it before someone else does.', 'خدها قبل ما حدا غيرك ياخدها.');
  const lede = settings
    ? isAr
      ? settings.heroLedeAr
      : settings.heroLedeEn
    : t(
        'Women, men and kids — clothing you actually wear, paid for on delivery.',
        'نساء ورجال وأطفال — ملابس ترتديها فعلاً، وتدفع عند الاستلام.'
      );
  const ctaLabel = settings
    ? isAr
      ? settings.heroCtaLabelAr
      : settings.heroCtaLabelEn
    : t('Discover', 'اكتشف الآن');

  // Admin-set CTA collection, else the first nav collection, else the seeded /women.
  const ctaSlug = settings?.heroCtaCollection?.slug ?? navCollections?.[0]?.slug ?? 'women';

  return (
    <section className="hero" data-home-hero aria-labelledby="hero-title">
      <div className="hero__inner">
        <div className="hero__lead">
          <p className="eyebrow hero__eyebrow">{eyebrow}</p>
          <h1 id="hero-title" className="hero__title">
            {headline}
          </h1>
        </div>

        <div className="hero__media">
          <Image
            src="/home-hero-bg.png"
            alt={t("Ali — Ali's Store", 'علي — متجر علي')}
            className="hero__img"
            width={549}
            height={722}
            preload
            sizes="(max-width: 900px) 80vw, 34vw"
          />
        </div>

        <div className="hero__aside">
          <p className="hero__lede">{lede}</p>
          <Link href={`/${locale}/${ctaSlug}`} className="btn btn--primary btn--lg hero__cta">
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
