import Link from 'next/link';
import Image from 'next/image';
import heroAli from '../../../public/hero-ali.png';

/**
 * Home hero: an editorial text block (eyebrow · headline · lede · Discover CTA)
 * beside the brand illustration.
 * TODO: move the copy + image to an admin-editable "home settings" source.
 */
export function Hero({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__content">
        <p className="eyebrow">{t('Limited stock', 'كمية محدودة')}</p>
        <h1 id="hero-title" className="hero__title">
          {isAr ? (
            'خدها قبل ما حدا غيرك ياخدها.'
          ) : (
            <>
              Buy it before <em>someone</em> else does.
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

      <div className="hero__media">
        <Image
          src={heroAli}
          alt={t("Ali — Ali's Store", 'علي — متجر علي')}
          className="hero__img"
          priority
          sizes="(max-width: 860px) 92vw, (max-width: 1280px) 52vw, 640px"
        />
      </div>
    </section>
  );
}
