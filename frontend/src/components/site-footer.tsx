'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useNavCollections } from '@/hooks/use-catalog';
import { useSettings } from '@/hooks/use-settings';
import { openConsentSettings } from '@/lib/consent';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';

/** Defence in depth for the admin-controlled social links: only ever emit an
 *  `<a href>` for an absolute http(s) URL. Anything else (a `javascript:` /
 *  `data:` value that slipped past the API, or is already in the DB) is
 *  dropped rather than rendered as a clickable XSS payload. */
function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Shared footer rendered by the root [locale] layout. Multi-column layout
 *  (Saxon footer anatomy). The newsletter field is presentational only —
 *  no submit wiring here. Brand name + social/contact links come from the
 *  admin's site settings; a blank link is simply omitted. */
export function SiteFooter({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { data: navCollections, isPending: navPending } = useNavCollections();
  const { data: settings } = useSettings();

  // The "newsletter" field is really an account sign-up teaser — Join carries
  // the typed email to the register page. Hidden once you're signed in.
  const [joinEmail, setJoinEmail] = useState('');
  const goToRegister = () => {
    const q = joinEmail.trim() ? `?email=${encodeURIComponent(joinEmail.trim())}` : '';
    router.push(`/${locale}/register${q}`);
  };

  const brandName = settings
    ? isAr
      ? settings.brandNameAr
      : settings.brandNameEn
    : isAr
      ? DEFAULT_BRAND_NAME_AR
      : DEFAULT_BRAND_NAME_EN;

  const socials = [
    { label: 'Instagram', href: safeHttpUrl(settings?.instagramUrl) },
    { label: 'Facebook', href: safeHttpUrl(settings?.facebookUrl) },
    { label: 'TikTok', href: safeHttpUrl(settings?.tiktokUrl) },
    { label: 'WhatsApp', href: safeHttpUrl(settings?.whatsappUrl) },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href));

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__grid">
          <div>
            <div className="site-footer__brand-name">{brandName}</div>
            <p>{t('Cash on delivery, handled by our team.', 'التوصيل نقدًا عند الاستلام، يتولاه فريقنا.')}</p>
            {!isAuthenticated && (
              <form
                className="newsletter"
                onSubmit={(e) => {
                  e.preventDefault();
                  goToRegister();
                }}
              >
                <Input
                  type="email"
                  name="email"
                  value={joinEmail}
                  onChange={(e) => setJoinEmail(e.target.value)}
                  placeholder={t('Email address', 'البريد الإلكتروني')}
                  aria-label={t('Email address to create an account', 'البريد الإلكتروني لإنشاء حساب')}
                />
                <Button type="submit" size="sm">
                  {t('Join', 'اشترك')}
                </Button>
              </form>
            )}
            {socials.length > 0 && (
              <div className="site-footer__social">
                {socials.map((s) => (
                  <a key={s.label} className="site-footer__link" href={s.href} target="_blank" rel="noreferrer noopener">
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="site-footer__col-title">{t('Shop', 'تسوق')}</p>
            {navPending
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="site-footer__link" style={{ width: '6rem' }} />
                ))
              : (navCollections ?? []).map((c) => (
                  <Link key={c.id} className="site-footer__link" href={`/${locale}/${c.slug}`}>
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
            {settings?.contactEmail && (
              <a className="site-footer__link" href={`mailto:${settings.contactEmail}`}>
                {settings.contactEmail}
              </a>
            )}
            {settings?.contactPhone && (
              <a className="site-footer__link" href={`tel:${settings.contactPhone.replace(/\s+/g, '')}`}>
                {settings.contactPhone}
              </a>
            )}
          </div>

          <div>
            <p className="site-footer__col-title">{t('About', 'عن المتجر')}</p>
            {(settings?.storyBodyEn ||
              settings?.storyBodyAr ||
              settings?.storyTitleEn ||
              settings?.storyTitleAr) && (
              <Link className="site-footer__link" href={`/${locale}/our-story`}>
                {t('Our story', 'قصتنا')}
              </Link>
            )}
            <Link className="site-footer__link" href={`/${locale}#visit-us`}>
              {t('Visit us', 'زورونا')}
            </Link>
            <Link className="site-footer__link" href={`/${locale}/delivery-returns`}>
              {t('Delivery & returns', 'التوصيل والإرجاع')}
            </Link>
            <Link className="site-footer__link" href={`/${locale}/privacy`}>
              {t('Privacy policy', 'سياسة الخصوصية')}
            </Link>
            <button
              type="button"
              className="site-footer__link site-footer__link--button"
              onClick={openConsentSettings}
            >
              {t('Cookie preferences', 'تفضيلات ملفات تعريف الارتباط')}
            </button>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>
            © {new Date().getFullYear()} {brandName}
          </span>
          <span>{t('Prices in USD', 'الأسعار بالدولار الأمريكي')}</span>
        </div>
      </div>
    </footer>
  );
}
