import type { MetadataRoute } from 'next';
import { catalogApi } from '@/lib/api';
import { absoluteUrl } from '@/lib/site';
import type { Product } from '@/lib/types';

// Regenerated at most hourly rather than on every single crawl hit — a
// sitemap doesn't need to the second, and this bounds how often it re-fetches
// the entire catalog.
export const revalidate = 3600;

const LOCALES = ['en', 'ar'] as const;
// Genuinely indexable informational pages beyond the catalog itself — kept
// to real, substantive content (About/Contact-equivalent + policy pages),
// not every route in the app. Cart/checkout/login/account/orders/admin/etc.
// are deliberately absent; see next.config.mjs's X-Robots-Tag block for
// where those are actively kept OUT of the index.
const STATIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/our-story', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/delivery-returns', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
];

const PRODUCT_PAGE_SIZE = 60; // the backend's own max (product.schema.ts)
const MAX_PRODUCT_PAGES = 200; // defensive ceiling — 12,000 products; a real
// runaway here would mean something is wrong with `total`, not a catalog
// that's actually this large; better to cap than hang sitemap generation.

async function collectAllActiveProducts(): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 1; page <= MAX_PRODUCT_PAGES; page++) {
    const res = await catalogApi.listProducts(
      { page, pageSize: PRODUCT_PAGE_SIZE },
      { signal: AbortSignal.timeout(8000) }
    );
    all.push(...res.items);
    if (res.items.length < PRODUCT_PAGE_SIZE || all.length >= res.total) break;
  }
  return all;
}

/** Dynamic sitemap — every URL built through `absoluteUrl()` (lib/site.ts),
 *  the same single source of truth canonical tags and Open Graph/structured
 *  data use, so a sitemap entry, its page's canonical, and its JSON-LD `url`
 *  can never drift onto different hosts from each other. No `status`/
 *  `includeInactive` passed to any catalog call below: this route has no
 *  admin session, so the backend's own `resolveListStatus` already narrows
 *  every one of them to the storefront-visible ('active') set — nothing
 *  archived or hidden ends up in the sitemap by construction, not by a
 *  client-side filter here that could drift out of sync with it. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  for (const { path, priority, changeFrequency } of STATIC_PATHS) {
    for (const locale of LOCALES) {
      entries.push({ url: absoluteUrl(`/${locale}${path}`), priority, changeFrequency });
    }
  }

  try {
    const categories = await catalogApi.listCategories(undefined, { signal: AbortSignal.timeout(8000) });
    for (const cat of categories) {
      for (const locale of LOCALES) {
        entries.push({
          url: absoluteUrl(`/${locale}/category/${cat.slug}`),
          priority: 0.7,
          changeFrequency: 'daily',
        });
      }
    }
  } catch {
    // Backend unreachable/slow for this one sitemap regeneration — ships
    // without categories this round; the next `revalidate` picks them up.
  }

  try {
    const collections = await catalogApi.listCollections(undefined, { signal: AbortSignal.timeout(8000) });
    for (const col of collections) {
      for (const locale of LOCALES) {
        entries.push({ url: absoluteUrl(`/${locale}/${col.slug}`), priority: 0.7, changeFrequency: 'daily' });
      }
    }
  } catch {
    // Same graceful degradation as categories above.
  }

  try {
    const products = await collectAllActiveProducts();
    for (const p of products) {
      for (const locale of LOCALES) {
        entries.push({
          url: absoluteUrl(`/${locale}/product/${p.id}`),
          lastModified: new Date(p.lastEdit),
          priority: 0.8,
          changeFrequency: 'weekly',
        });
      }
    }
  } catch {
    // Same graceful degradation as categories/collections above.
  }

  return entries;
}
