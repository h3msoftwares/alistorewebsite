'use client';

import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { STOREFRONT_COLLECTIONS } from '@/lib/collections';

/** Shared footer rendered by the root [locale] layout. Multi-column layout
 *  (Saxon footer anatomy). The newsletter field is presentational only —
 *  no submit wiring here. */
export function SiteFooter({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__grid">
          <div>
            <div className="site-footer__brand-name">Ali&apos;s Store</div>
            <p>{t('Cash on delivery, handled by our team.', 'التوصيل نقدًا عند الاستلام، يتولاه فريقنا.')}</p>
            <form className="newsletter" onSubmit={(e) => e.preventDefault()}>
              <Input
                type="email"
                name="email"
                placeholder={t('Email address', 'البريد الإلكتروني')}
                aria-label={t('Email address for newsletter', 'البريد الإلكتروني للنشرة')}
              />
              <Button type="submit" size="sm">
                {t('Join', 'اشترك')}
              </Button>
            </form>
            <div className="site-footer__social">
              <a className="site-footer__link" href="#">
                Instagram
              </a>
              <a className="site-footer__link" href="#">
                Facebook
              </a>
              <a className="site-footer__link" href="#">
                TikTok
              </a>
            </div>
          </div>

          <div>
            <p className="site-footer__col-title">{t('Shop', 'تسوق')}</p>
            {STOREFRONT_COLLECTIONS.map((c) => (
              <Link key={c.slug} className="site-footer__link" href={`/${locale}/${c.slug}`}>
                {isAr ? c.nameAr : c.nameEn}
              </Link>
            ))}
          </div>

          <div>
            <p className="site-footer__col-title">{t('Customer service', 'خدمة العملاء')}</p>
            <Link className="site-footer__link" href={`/${locale}/orders`}>
              {t('Track order', 'تتبع الطلب')}
            </Link>
            <Link className="site-footer__link" href={`/${locale}/account`}>
              {t('My account', 'حسابي')}
            </Link>
            <a className="site-footer__link" href="#">
              {t('Contact us', 'اتصل بنا')}
            </a>
          </div>

          <div>
            <p className="site-footer__col-title">{t('About', 'عن المتجر')}</p>
            <a className="site-footer__link" href="#">
              {t('Our story', 'قصتنا')}
            </a>
            <a className="site-footer__link" href="#">
              {t('Delivery & returns', 'التوصيل والإرجاع')}
            </a>
            <a className="site-footer__link" href="#">
              {t('Privacy policy', 'سياسة الخصوصية')}
            </a>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© {new Date().getFullYear()} Ali&apos;s Store</span>
          <span>{t('Prices in USD', 'الأسعار بالدولار الأمريكي')}</span>
        </div>
      </div>
    </footer>
  );
}
