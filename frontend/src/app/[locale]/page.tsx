import type { Metadata } from 'next';
import { Hero } from '@/components/home/hero';
import { HomeMiddle } from '@/components/home/home-middle';
import { StoreInfo } from '@/components/home/store-info';
import { CustomerReviews } from '@/components/home/customer-reviews';
import { absoluteUrl, buildOpenGraph, buildTwitter, SITE_DESCRIPTION_AR, SITE_DESCRIPTION_EN } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';
  // Brand first here (unlike the `%s | Ali'sStore` template every other
  // page gets from the root layout) — the homepage IS the brand's primary
  // entry point, not a specific product/category the template's ordering
  // otherwise suits. `title.absolute` opts out of the inherited template.
  const title = isAr ? "Ali'sStore | ملابس نساء ورجال وأطفال" : "Ali'sStore | Women's, Men's & Kids' Clothing";
  const description = isAr ? SITE_DESCRIPTION_AR : SITE_DESCRIPTION_EN;
  const url = absoluteUrl(`/${locale}`);

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: url,
      languages: { en: absoluteUrl('/en'), ar: absoluteUrl('/ar') },
    },
    // buildOpenGraph/buildTwitter (lib/site.ts) rather than a partial object
    // — Next doesn't deep-merge these with the layout's, so a bare
    // `{title, description, url}` here would silently lose the layout's
    // default image/card/siteName (confirmed in this app's own build output).
    openGraph: buildOpenGraph({ title, description, url, locale: isAr ? 'ar' : 'en' }),
    twitter: buildTwitter({ title, description }),
  };
}

/**
 * Home page structure:
 *   1. Hero — full-bleed brand illustration; text + Discover button in the gutters
 *   2. Zone 1 (featured) — admin-picked collections + categories
 *      (Collection.showOnHome / Category.showOnHome), interleaved by
 *      sortOrder, each its own horizontally-scrollable row
 *   3. Zone 2 (more) — every other collection, same row treatment
 *   4. Store info — admin-controlled "Visit us" block (address + hours),
 *      shown just above the footer when set
 *   5. Customer reviews — admin-uploaded review screenshots in a horizontal
 *      strip, shown under Store info when any are added
 *
 * See `home-middle.tsx` for the data assembly.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <>
      <Hero locale={locale} />
      <HomeMiddle locale={locale} />
      <StoreInfo locale={locale} />
      <CustomerReviews locale={locale} />
    </>
  );
}
