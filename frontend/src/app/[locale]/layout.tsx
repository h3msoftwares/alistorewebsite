import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import '@/styles/globals.css';

// app/[locale]/layout.tsx doubles as the ROOT layout (it renders <html>) —
// this is the standard next-intl-style pattern so <html lang dir> can be
// set per-locale. middleware.ts redirects "/" to "/en" or "/ar".

export const metadata: Metadata = {
  title: "Ali's Store",
  description: 'Ali\u2019s Store — Women, Men & Kids clothing, cash on delivery.',
};

const LOCALES = ['en', 'ar'] as const;
type Locale = (typeof LOCALES)[number];

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: Locale };
}) {
  const { locale } = params;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} data-theme="system" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <SiteHeader locale={locale} />
          {children}
          <SiteFooter locale={locale} />
        </ThemeProvider>
      </body>
    </html>
  );
}
