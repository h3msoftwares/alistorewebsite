import { absoluteUrl, DEFAULT_OG_IMAGE_PATH, getSiteUrl } from './site';
import type { Category, Collection, Product } from './types';

type Locale = 'en' | 'ar';
type JsonLdObject = Record<string, unknown>;

/** Site-wide Organization — same static logo the header uses, and only the
 *  social/contact fields that are actually set in the admin's live settings.
 *  Never fabricates a sameAs/email/phone that isn't genuinely configured. */
export function organizationJsonLd(opts: {
  brandName: string;
  sameAs?: (string | null | undefined)[];
  email?: string | null;
  phone?: string | null;
}): JsonLdObject {
  const sameAs = (opts.sameAs ?? []).filter((v): v is string => Boolean(v));
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: opts.brandName,
    url: getSiteUrl(),
    logo: absoluteUrl(DEFAULT_OG_IMAGE_PATH),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(opts.email ? { email: opts.email } : {}),
    ...(opts.phone ? { telephone: opts.phone } : {}),
  };
}

/** Site-wide WebSite entity. No SearchAction: the storefront's search is a
 *  client-side overlay with no indexable results URL to point one at
 *  (fabricating one would violate "no fake search functionality"). */
export function websiteJsonLd(opts: { brandName: string }): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: opts.brandName,
    url: getSiteUrl(),
  };
}

/** `url` omitted for a crumb with no href (the current page, or a dead-end
 *  crumb with nothing to link to) — schema.org only requires `item` on every
 *  ListItem except optionally the last, and a mid-list crumb genuinely has no
 *  URL in those same cases the visible <Breadcrumb> renders as plain text. */
export function breadcrumbJsonLd(items: { name: string; url?: string }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

/** Real fields only — no brand (Product has no brand field in this data
 *  model), no reviews/ratings (none exist), no invented SKU/price/
 *  availability. `url` is the canonical product URL (bare, no ?color=/
 *  &size= — those are deep-link conveniences, not distinct products). */
export function productJsonLd(product: Product, locale: Locale, url: string): JsonLdObject {
  const name = locale === 'ar' ? product.nameAr : product.nameEn;
  const description = locale === 'ar' ? product.descriptionAr : product.descriptionEn;
  const images = product.images.map((i) => i.url).filter(Boolean);
  const totalStock = product.variants.reduce((n, v) => n + v.stockQuantity, 0);
  const price = Number(product.effectivePrice ?? product.price);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    ...(description ? { description } : {}),
    sku: product.sku,
    ...(images.length > 0 ? { image: images } : {}),
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      price: price.toFixed(2),
      availability: totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
}

/** The products/categories actually rendered on a category or collection
 *  page's first screenful — real visible content and order, not a
 *  fabricated listing. `items` should be whatever the page itself fetched
 *  to render (the same first page a shopper sees), not a separate query. */
export function itemListJsonLd(items: { name: string; url: string }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: item.url,
      name: item.name,
    })),
  };
}

export function categoryItemName(cat: Pick<Category, 'nameEn' | 'nameAr'>, locale: Locale): string {
  return locale === 'ar' ? cat.nameAr : cat.nameEn;
}

export function collectionItemName(col: Pick<Collection, 'nameEn' | 'nameAr'>, locale: Locale): string {
  return locale === 'ar' ? col.nameAr : col.nameEn;
}
