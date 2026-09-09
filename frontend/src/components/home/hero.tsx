'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Icon } from '@/components/ui';
import { useSettings } from '@/hooks/use-settings';
import { useNavCollections } from '@/hooks/use-catalog';
import { useReveal } from '@/hooks/use-reveal';

/**
 * Home hero: a full-bleed near-black band (== --color-secondary) filling the
 * first screenful, with the brand illustration centred in the middle and the
 * editorial copy split to either side — eyebrow + headline at the inline-start,
 * lede + Discover CTA at the inline-end. Light text on the dark field; a
 * deliberate dark band, not a dark-mode toggle. The illustration is a
 * transparent PNG so it sits directly on the band with no visible frame.
 *
 * The band fills exactly the space under the chrome above it so the
 * bottom-anchored illustration lands on the fold with no gap. That chrome
 * varies — the offers strip mounts after settings load, can be dismissed, and
 * wraps to two lines when narrow — so its real height is measured at runtime
 * into `--hero-chrome` rather than assumed (CSS falls back to just the header).
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

  const [leadRef, leadClass, leadStyle] = useReveal(0);
  const [mediaRef, mediaClass, mediaStyle] = useReveal(80);
  const [asideRef, asideClass, asideStyle] = useReveal(140);

  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Distance from the top of the document to the top of the hero = the total
    // height of the offers strip + sticky header stacked above it. Scroll-
    // invariant (getBoundingClientRect().top + scrollY), so it's correct
    // whenever it runs.
    const sync = () => {
      const chrome = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty('--hero-chrome', `${Math.max(0, Math.round(chrome))}px`);
    };
    sync();
    // The offers strip changes the document height when it mounts/dismisses/
    // wraps — re-measure on any of that.
    const ro = new ResizeObserver(sync);
    ro.observe(document.body);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, []);

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
    <section ref={ref} className="hero" data-home-hero aria-labelledby="hero-title">
      <div className="hero__inner">
        <div ref={leadRef} className={`hero__lead ${leadClass}`} style={leadStyle}>
          <p className="eyebrow hero__eyebrow">{eyebrow}</p>
          <h1 id="hero-title" className="hero__title">
            {headline}
          </h1>
        </div>

        <div ref={mediaRef} className={`hero__media ${mediaClass}`} style={mediaStyle}>
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

        <div ref={asideRef} className={`hero__aside ${asideClass}`} style={asideStyle}>
          <p className="hero__lede">{lede}</p>
          <Link href={`/${locale}/${ctaSlug}`} className="btn btn--primary btn--lg hero__cta">
            <span>{ctaLabel}</span>
            <span className="hero__cta-arrow" aria-hidden>
              <Icon as={ArrowRight} size={18} flipRtl />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
