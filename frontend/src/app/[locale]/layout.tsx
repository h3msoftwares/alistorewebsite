import type { Metadata } from 'next';
import { Dosis, Cairo } from 'next/font/google';
import { dehydrate } from '@tanstack/react-query';
import { StoreProvider } from '@/store/provider';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { makeQueryClient } from '@/lib/query-client';
import { queryKeys } from '@/lib/query-keys';
import { catalogApi, settingsApi } from '@/lib/api';
import { DEFAULT_BRAND_NAME_EN } from '@/lib/site';
import '@/styles/globals.css';

// app/[locale]/layout.tsx doubles as the ROOT layout (it renders <html>) —
// this is the standard next-intl-style pattern so <html lang dir> can be
// set per-locale. middleware.ts redirects "/" to "/en" or "/ar".

// Fonts backing the --font-sans/--font-serif/--font-arabic chains declared
// in globals.css — loaded here via next/font (self-hosted, no layout shift)
// and exposed as CSS variables so the stylesheet's fallback chains resolve
// to a real face instead of silently falling back to system fonts.
// Dosis covers both English roles (body + headings — see --font-sans /
// --font-serif in globals.css); Cairo covers Arabic. Neither ships a true
// italic, so the "one italic accent word per headline" heading pattern
// renders as a browser-synthesized (faux) slant.
const dosis = Dosis({ subsets: ['latin'], variable: '--font-dosis', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  let brand = DEFAULT_BRAND_NAME_EN;
  try {
    const settings = await settingsApi.getSettings();
    brand = locale === 'ar' ? settings.brandNameAr : settings.brandNameEn;
  } catch {
    // Backend unreachable at build/render time — the default is fine.
  }
  return {
    title: brand,
    description: `${brand} — Women, Men & Kids clothing, cash on delivery.`,
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

  // Prime the collections list so the nav / footer / home showcase render with
  // data on first paint instead of flashing skeletons. `prefetchQuery` never
  // throws, and only successful queries dehydrate — a build with no backend
  // just falls back to client fetching.
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.collections.list(false),
      queryFn: () => catalogApi.listCollections({ includeInactive: false }),
    }),
    queryClient.prefetchQuery({
      queryKey: ['settings'],
      queryFn: () => settingsApi.getSettings(),
    }),
  ]);

  return (
    <html lang={locale} dir={dir} className={`${dosis.variable} ${cairo.variable}`}>
      <body>
        <StoreProvider dehydratedState={dehydrate(queryClient)}>
          <a href="#main" className="skip-link">
            {skipLabel}
          </a>
          <SiteHeader locale={locale} />
          <main id="main">{children}</main>
          <SiteFooter locale={locale} />
        </StoreProvider>
      </body>
    </html>
  );
}
