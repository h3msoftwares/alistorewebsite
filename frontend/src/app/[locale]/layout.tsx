import type { Metadata } from 'next';
import { Alex_Brush, Cairo, Inter, Markazi_Text, Playfair_Display } from 'next/font/google';
import { dehydrate } from '@tanstack/react-query';
import { StoreProvider } from '@/store/provider';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';
import { CookieConsent } from '@/components/chrome/cookie-consent';
import { WhatsappBubble } from '@/components/chrome/whatsapp-bubble';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { JsonLd } from '@/components/seo/json-ld';
import { makeQueryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import { catalogApi, settingsApi } from '@/lib/api';
import {
  absoluteUrl,
  buildOpenGraph,
  buildTwitter,
  DEFAULT_BRAND_NAME_EN,
  getSiteUrl,
  SITE_DESCRIPTION_AR,
  SITE_DESCRIPTION_EN,
} from '@/lib/site';
import { organizationJsonLd, websiteJsonLd } from '@/lib/structured-data';
import type { SiteSettings } from '@/lib/types';
import '@/styles/globals.css';

// app/[locale]/layout.tsx doubles as the ROOT layout (it renders <html>) —
// this is the standard next-intl-style pattern so <html lang dir> can be
// set per-locale. middleware.ts redirects "/" to "/en" or "/ar".

// Fonts backing the --font-sans/--font-serif/--font-arabic/--font-arabic
// -heading/--font-brand chains declared in globals.css — loaded here via
// next/font (self-hosted, no layout shift) and exposed as CSS variables so
// the stylesheet's fallback chains resolve to a real face instead of
// silently falling back to system fonts.
//   --font-sans     Inter            English body / UI / buttons
//   --font-serif    Playfair Display English headings + section titles
//   --font-arabic           Cairo         Arabic body / UI
//   --font-arabic-heading   Markazi Text  Arabic headings + section titles
// Playfair Display ships a true italic (unlike the old single-style Dosis),
// so the "one italic accent word per headline" pattern renders as a real
// slanted cut, not a browser-synthesized fake one.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});
const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });
const markaziText = Markazi_Text({ subsets: ['arabic', 'latin'], variable: '--font-markazi', display: 'swap' });
// Latin-only script face for the brand wordmark ("Ali's Store" in the header
// logo + footer). Alex Brush has no Arabic glyphs, so the Arabic wordmark
// stays on --font-arabic (Cairo) — see the [lang='ar'] overrides in globals.css.
const alexBrush = Alex_Brush({ subsets: ['latin'], weight: '400', variable: '--font-alex-brush', display: 'swap' });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';
  let brand = DEFAULT_BRAND_NAME_EN;
  try {
    // Every one of the ~170 page x locale renders in a static-generation
    // pass hits this — with no timeout, an occasional slow/overloaded
    // backend response (this fetch has none applied by default) blocked the
    // whole page past Next's static-generation budget instead of falling
    // through to the "unreachable" branch below, which is the actual
    // behaviour this try/catch was designed for (fix-list: intermittent
    // Netlify build timeouts on an otherwise-fixed set of pages, traced to
    // this and the prefetches below never actually erroring — just hanging).
    const settings = await settingsApi.getSettings({ signal: AbortSignal.timeout(8000) });
    brand = isAr ? settings.brandNameAr : settings.brandNameEn;
  } catch {
    // Backend unreachable (or too slow) at build/render time — the default is fine.
  }
  const description = isAr ? SITE_DESCRIPTION_AR : SITE_DESCRIPTION_EN;
  const url = absoluteUrl(`/${locale}`);

  return {
    // Single source of truth (lib/site.ts's getSiteUrl()) so a relative
    // `openGraph.images`/`icons` URL anywhere in the app resolves against the
    // real production origin, not whatever host actually served the request.
    metadataBase: new URL(getSiteUrl()),
    // `%s | Alistore` for every page that sets its own `title` (product name,
    // category name, ...); pages with no title of their own fall back to
    // `brand` alone via the `default`. NOT `alternates.canonical` here —
    // that would inherit onto every page that doesn't set its own, wrongly
    // canonicalizing them at the locale root. Each indexable page sets its
    // own canonical instead (home/product/category/collection do; a handful
    // of secondary pages — privacy, our-story, auth forms — don't yet, which
    // just means no explicit canonical there rather than a wrong one).
    title: { default: brand, template: `%s | ${brand}` },
    description,
    robots: { index: true, follow: true },
    // buildOpenGraph/buildTwitter (lib/site.ts): Next does NOT deep-merge
    // these between layout and page, so any page that sets its own partial
    // openGraph/twitter must go through the same two builders to stay
    // complete rather than silently dropping siteName/images/card — see
    // their doc comment for how this was actually confirmed, not assumed.
    openGraph: buildOpenGraph({ title: brand, description, url, locale: isAr ? 'ar' : 'en' }),
    twitter: buildTwitter({ title: brand, description }),
  };
}

const LOCALES = ['en', 'ar'] as const;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

// Next's generated route types (.next/types) type every [locale] dynamic
// segment as a plain string, regardless of what generateStaticParams
// returns — a narrower union here makes this component incompatible with
// the LayoutProps<"/[locale]"> slot Next actually calls it with, and
// `next build`'s route-type validator catches that mismatch. Narrow to
// 'en' | 'ar' inside the function body instead, where it's just a value
// comparison, not a prop type.
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  const skipLabel = locale === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content';

  // Prime the top-level categories (Women/Men/Kids — nav/footer/home banner)
  // and the collections list (Sale/New Arrivals) so they render with data on
  // first paint instead of flashing skeletons. `prefetchQuery` never throws,
  // and only successful queries dehydrate — a build with no backend just
  // falls back to client fetching. Every one of these three ran with no
  // timeout on every page x locale render (~170 times in one static-
  // generation pass) — an occasional slow backend response hung the whole
  // page past Next's static-generation budget instead of ever reaching that
  // no-throw fallback, which only covers a fetch actually erroring, not one
  // that just never resolves. `AbortSignal.timeout` turns "slow" into
  // "unreachable" fast enough to stay well inside that budget either way.
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.categories.topLevel(),
      queryFn: () => catalogApi.listTopLevelCategories({ signal: AbortSignal.timeout(8000) }),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.collections.list(false),
      queryFn: () => catalogApi.listCollections({ includeInactive: false }, { signal: AbortSignal.timeout(8000) }),
    }),
    queryClient.prefetchQuery({
      queryKey: ['settings'],
      queryFn: () => settingsApi.getSettings({ signal: AbortSignal.timeout(8000) }),
    }),
  ]);

  // Reuses the settings prefetch above rather than a 4th fetch — absent
  // (backend unreachable/slow) just means Organization renders with no
  // sameAs/contact fields, same graceful degradation as everything else
  // here. Real values only: sameAs/email/phone are omitted entirely when
  // not set in the admin's live settings, never fabricated.
  const settings = queryClient.getQueryData<SiteSettings>(['settings']);
  const brandName = settings ? (locale === 'ar' ? settings.brandNameAr : settings.brandNameEn) : DEFAULT_BRAND_NAME_EN;

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${playfairDisplay.variable} ${cairo.variable} ${markaziText.variable} ${alexBrush.variable}`}
    >
      <body>
        <JsonLd
          data={organizationJsonLd({
            brandName,
            sameAs: [settings?.instagramUrl, settings?.facebookUrl, settings?.tiktokUrl],
            email: settings?.contactEmail,
            phone: settings?.contactPhone,
          })}
        />
        <JsonLd data={websiteJsonLd({ brandName })} />
        <StoreProvider dehydratedState={dehydrate(queryClient)}>
          <GoogleAnalytics />
          <a href="#main" className="skip-link">
            {skipLabel}
          </a>
          <SiteHeader locale={locale} />
          <main id="main">{children}</main>
          <SiteFooter locale={locale} />
          <WhatsappBubble locale={locale} />
          <CookieConsent locale={locale} />
        </StoreProvider>
      </body>
    </html>
  );
}
