/** Brand-name fallbacks for the few server-rendered spots that can't call
 *  `useSettings()` (metadata, auth-form eyebrows). The storefront chrome
 *  itself reads the live value from `GET /api/settings`. */
export const DEFAULT_BRAND_NAME_EN = "Ali'sStore";
export const DEFAULT_BRAND_NAME_AR = "Ali'sStore";

// ---- SEO / canonical site identity ----
// Single source of truth for the storefront's own public URL — every
// canonical link, sitemap entry, robots.txt directive, Open Graph URL, and
// structured-data @id/url below is built from getSiteUrl(), so there's
// exactly one place that ever needs to change between environments.

/** No trailing slash — every helper below appends its own leading slash. */
function normalizeSiteUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/** The storefront's own canonical origin, e.g. `https://alistore.clothing` in
 *  production. Falls back to localhost so local dev / CI builds (no real
 *  domain configured yet) never need `NEXT_PUBLIC_SITE_URL` set — but
 *  production deploys must set it to the real apex domain (see
 *  frontend/.env.example). Never has a trailing slash. */
export function getSiteUrl(): string {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');
}

/** Joins a site-relative path onto the canonical origin — the one function
 *  every canonical/OG/sitemap/structured-data URL in the app should go
 *  through, so they can never drift onto a different host from each other.
 *  `path` should start with `/` (e.g. `/en`, `/en/product/abc`); `/` itself
 *  is handled without a doubled slash. */
export function absoluteUrl(path: string): string {
  const base = getSiteUrl();
  if (!path || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Default storefront description — used as the root layout's `description`
 *  and as the fallback wherever a page has no more specific one of its own
 *  (a product/category with no description set, etc.). Kept honest/generic
 *  on purpose — see SITE_DESCRIPTION_AR for the Arabic equivalent. */
export const SITE_DESCRIPTION_EN =
  "Ali'sStore — women's, men's and kids' clothing, cash on delivery.";
export const SITE_DESCRIPTION_AR = 'متجر Ali\'sStore — ملابس نساء ورجال وأطفال، الدفع عند الاستلام.';

/** Static brand mark, not admin-editable — same file the header logo already
 *  uses (components/chrome/topbar.tsx). Used as the Organization logo and the
 *  default Open Graph/Twitter image when a page has no more specific image
 *  of its own (a product photo, a category image, ...). */
export const DEFAULT_OG_IMAGE_PATH = '/ali-store-A-traced.png';

/** Next's Metadata API does NOT deep-merge `openGraph`/`twitter` between a
 *  layout and a page — whichever one is closer to the matched route wins
 *  *wholesale* for that key, dropping every field the other set (confirmed
 *  against this app's own built output: a page setting only
 *  `openGraph: {title, description, url}` silently lost the root layout's
 *  `images`/`locale`/`siteName`/`type`, and `twitter: {title, description}`
 *  lost `card`, rendering `summary` with no image instead of
 *  `summary_large_image`). These two builders exist so every page's
 *  `openGraph`/`twitter` object is always complete on its own, never a
 *  partial that quietly loses the layout's defaults. */
export function buildOpenGraph(opts: {
  title: string;
  description?: string;
  url: string;
  locale: 'en' | 'ar';
  /** Absolute URL — a product/category's own photo, when it has one. */
  image?: string;
}) {
  return {
    type: 'website' as const,
    siteName: DEFAULT_BRAND_NAME_EN,
    title: opts.title,
    description: opts.description,
    url: opts.url,
    locale: opts.locale === 'ar' ? 'ar_LB' : 'en_US',
    images: [{ url: opts.image ?? absoluteUrl(DEFAULT_OG_IMAGE_PATH) }],
  };
}

export function buildTwitter(opts: { title: string; description?: string; image?: string }) {
  return {
    card: 'summary_large_image' as const,
    title: opts.title,
    description: opts.description,
    images: [opts.image ?? absoluteUrl(DEFAULT_OG_IMAGE_PATH)],
  };
}
