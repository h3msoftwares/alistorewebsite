'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { GA_MEASUREMENT_ID, trackPageView } from '@/lib/analytics/ga';

/**
 * Loads GA4 (gtag.js) and reports SPA page views.
 *
 * Renders nothing unless `NEXT_PUBLIC_GA4_MEASUREMENT_ID` is set, so dev and
 * any build without the env var stay completely GA-free. gtag is configured
 * with `send_page_view: false`; the effect sends one `page_view` on mount and
 * on every App Router client navigation. If the very first effect run beats
 * the `afterInteractive` init script the initial hit is skipped, but the GA4
 * session still starts on the next event or navigation.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || !pathname) return;
    trackPageView(pathname);
  }, [pathname]);

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
          gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'granted' });
          gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
