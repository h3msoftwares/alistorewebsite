import Link from 'next/link';
import Image from 'next/image';

/**
 * Home hero: a full-bleed near-black band (== --color-secondary) filling the
 * first screenful, with the brand illustration centred in the middle and the
 * editorial copy split to either side — eyebrow + headline at the inline-start,
 * lede + Discover CTA at the inline-end. Light text on the dark field; a
 * deliberate dark band, not a dark-mode toggle. The illustration's own black
 * backdrop blends into the band so it reads as one piece.
 *
 * The image is referenced by path (not a static import) so the build doesn't
 * depend on the asset being present: drop the artwork at
 * `frontend/public/home-hero-bg.png` and set width/height below to its real
 * pixel size.
 * TODO: move the copy + image to an admin-editable "home settings" source.
 */
export function Hero({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <section className="hero" data-home-hero aria-labelledby="hero-title">
      <div className="hero__inner">
        <div className="hero__lead">
          <p className="eyebrow hero__eyebrow">{t('Limited stock', 'كمية محدودة')}</p>
          <h1 id="hero-title" className="hero__title">
            {isAr ? (
              'خدها قبل ما حدا غيرك ياخدها.'
            ) : (
              <>
                Buy it before <em>someone</em> else does.
              </>
            )}
          </h1>
        </div>

        <div className="hero__media">
          <Image
            src="/home-hero-bg.png"
            alt={t("Ali — Ali's Store", 'علي — متجر علي')}
            className="hero__img"
            width={1280}
            height={720}
            preload
            sizes="(max-width: 900px) 92vw, 46vw"
          />
        </div>

        <div className="hero__aside">
          <p className="hero__lede">
            {t(
              'Women, men and kids — clothing you actually wear, paid for on delivery.',
              'نساء ورجال وأطفال — ملابس ترتديها فعلاً، وتدفع عند الاستلام.'
            )}
          </p>
          {/* TODO: point at the first nav collection (or an admin-set "featured"
              collection) once home settings are editable. `women` is seeded + in
              the nav, and resolves through the dynamic /[collection] route. */}
          <Link href={`/${locale}/women`} className="btn btn--primary btn--lg hero__cta">
            {t('Discover', 'اكتشف الآن')}
          </Link>
        </div>
      </div>
    </section>
  );
}
