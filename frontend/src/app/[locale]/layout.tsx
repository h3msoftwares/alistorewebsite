import type { Metadata } from 'next';
import { Inter, Playfair_Display, Noto_Naskh_Arabic } from 'next/font/google';
import { StoreProvider } from '@/store/provider';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import '@/styles/globals.css';

// app/[locale]/layout.tsx doubles as the ROOT layout (it renders <html>) —
// this is the standard next-intl-style pattern so <html lang dir> can be
// set per-locale. middleware.ts redirects "/" to "/en" or "/ar".

// Fonts backing the --font-sans/--font-serif/--font-arabic chains declared
// in globals.css — loaded here via next/font (self-hosted, no layout shift)
// and exposed as CSS variables so the stylesheet's fallback chains resolve
// to a real face instead of silently falling back to system fonts.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap' });
const notoNaskhArabic = Noto_Naskh_Arabic({ subsets: ['arabic'], variable: '--font-noto-naskh', display: 'swap' });

export const metadata: Metadata = {
  title: "Ali's Store",
  description: 'Ali’s Store — Women, Men & Kids clothing, cash on delivery.',
};

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

  return (
    <html lang={locale} dir={dir} className={`${inter.variable} ${playfair.variable} ${notoNaskhArabic.variable}`}>
      <body>
        <StoreProvider>
          <SiteHeader locale={locale} />
          {children}
          <SiteFooter locale={locale} />
        </StoreProvider>
      </body>
    </html>
  );
}
