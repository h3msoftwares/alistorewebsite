import Link from 'next/link';

/**
 * Home hero: an editorial text block (eyebrow · headline · lede · Discover CTA)
 * beside a full-bleed image. Structure only — TODO: real hero image + copy from
 * an admin-editable "home settings" source.
 */
export function Hero({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__content">
        <p className="eyebrow">{t('New season', 'الموسم الجديد')}</p>
        <h1 id="hero-title" className="hero__title">
          {isAr ? (
            <>
              أساسيات يومية، <em>تصلك أينما كنت</em>
            </>
          ) : (
            <>
              Everyday essentials, <em>delivered to your door</em>
            </>
          )}
        </h1>
        <p className="hero__lede">
          {t(
            'Women, men and kids — clothing you actually wear, paid for on delivery.',
            'نساء ورجال وأطفال — ملابس ترتديها فعلاً، وتدفع عند الاستلام.'
          )}
        </p>
        <Link href={`/${locale}/women`} className="btn btn--primary btn--lg hero__cta">
          {t('Discover', 'اكتشف الآن')}
        </Link>
      </div>

      <div className="hero__media" role="img" aria-label={t('Seasonal campaign image', 'صورة حملة الموسم')}>
        {/* TODO: <Image fill> with the campaign photo */}
        <span className="hero__media-placeholder" aria-hidden />
      </div>
    </section>
  );
}
