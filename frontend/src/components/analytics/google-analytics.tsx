'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { GA_MEASUREMENT_ID, trackPageView } from '@/lib/analytics/ga';
import { CONSENT_STORAGE_KEY, hasConsent, subscribeConsent } from '@/lib/consent';

/**
 * Loads GA4 (gtag.js) and reports SPA page views.
 *
 * Renders nothing unless `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set, so dev and
 * any build without the env var stay completely GA-free. gtag is configured
 * with `send_page_view: false`; the effect sends one `page_view` on mount and
 * on every App Router client navigation. If the very first effect run beats
 * the `afterInteractive` init script the initial hit is skipped, but the GA4
 * session still starts on the next event or navigation.
 *
 * Consent: `analytics_storage` starts `denied`. The init script reads the
 * stored cookie choice so a returning "Accept All" shopper is granted before
 * the first hit; the effect below keeps it in sync when the choice changes
 * during the session (banner buttons, footer "Cookie preferences"). Nothing
 * here is sent while denied — GA4 buffers events cookielessly until granted.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || !pathname) return;
    trackPageView(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    const sync = () => {
      window.gtag?.('consent', 'update', {
        analytics_storage: hasConsent('analytics') ? 'granted' : 'denied',
      });
    };
    sync();
    return subscribeConsent(sync);
  }, []);

  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        id="ga4-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          var __analyticsConsent = 'denied';
          try {
            if (localStorage.getItem('${CONSENT_STORAGE_KEY}') === 'all') __analyticsConsent = 'granted';
          } catch (e) {}
          gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: __analyticsConsent });
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
