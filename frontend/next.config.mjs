import bundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

// The API the browser talks to (fetch/XHR). Same value + same `??` (not
// `||`) as client.ts's own fallback: an unset var means local dev, but a
// deliberately EMPTY string means production's same-origin Netlify-proxy
// setup (see netlify.toml) — that case must stay empty, not fall back to
// localhost, since 'self' below already covers same-origin calls.
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

// The admin image uploader (lib/imagekit-upload.ts) POSTs files straight from
// the browser to ImageKit's upload endpoint, so `connect-src` must name it.
// This is a fixed ImageKit host, independent of any custom CDN endpoint.
const imagekitUploadOrigin = 'https://upload.imagekit.io';

// Third parties the storefront actually loads:
//  - Google Analytics 4 (gtag.js) — only ever runs after "Accept All" in the
//    cookie banner, but the origins must be allow-listed for it to load at all.
//  - hCaptcha — the checkout bot gate (script + iframe challenge + verify XHR).
const GA = ['https://www.googletagmanager.com', 'https://www.google-analytics.com'];
const HCAPTCHA = ['https://hcaptcha.com', 'https://*.hcaptcha.com'];

/**
 * Content-Security-Policy.
 *
 * Restrictive baseline — `default-src 'self'`, no `object`, no framing, form
 * posts only to ourselves. Two deliberate relaxations, both on the script /
 * style axis:
 *
 *  - `script-src` includes `'unsafe-inline'`. Next.js 16 injects inline
 *    bootstrap and per-route hydration `<script>` tags with no nonce of their
 *    own. The strict alternative (nonce + `strict-dynamic` via `proxy.ts`)
 *    forces every route to dynamic rendering, which would defeat static
 *    generation of the storefront. Revisit if the app moves mostly dynamic.
 *  - `style-src` includes `'unsafe-inline'`. `next/font` and the many
 *    `style={{…}}` props across the UI emit inline styles; there is no nonce
 *    path for those without the same dynamic-rendering cost.
 *
 * `'unsafe-eval'` and `ws:` are added in dev only (React Fast Refresh / HMR);
 * neither is present in a production build.
 *
 * A third relaxation, on `img-src`: it allows any `https:` source, not just
 * ImageKit's own host. Product/story/review photos are routinely sourced
 * from outside CDNs (Unsplash and similar stock-photo services) as well as
 * ImageKit uploads, so `img-src` needs to accept "any HTTPS image host" for
 * those to render at all — this is also what lets the seed scripts'
 * Unsplash placeholder photos (prisma/seed*.ts) load without a separate
 * dev-only carve-out. This directive only controls what `<img>` / CSS
 * `background-image` may load; it grants no script execution and doesn't
 * touch `script-src`/`connect-src`/`object-src` — the directives that
 * actually carry this policy's XSS defence.
 */
function contentSecurityPolicy() {
  const directives = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      ...GA,
      ...HCAPTCHA,
    ],
    'style-src': ["'self'", "'unsafe-inline'", ...HCAPTCHA],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:', ...HCAPTCHA],
    'connect-src': [
      "'self'",
      ...(apiOrigin ? [apiOrigin] : []),
      imagekitUploadOrigin,
      ...GA,
      'https://*.analytics.google.com',
      ...HCAPTCHA,
      ...(isDev ? ['ws:', 'wss:'] : []),
    ],
    'frame-src': [...HCAPTCHA],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  };
  if (!isDev) directives['upgrade-insecure-requests'] = [];

  return Object.entries(directives)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

// Private/non-valuable routes that must never be indexed, even if crawled or
// linked to from somewhere unexpected — kept in sync by hand with
// app/robots.ts's PRIVATE_PATHS (that file runs through Next's own bundling
// pipeline and can import from src/lib; this plain-Node-loaded config file
// can't). robots.txt disallow (in robots.ts) stops crawling; this header
// stops indexing of anything crawled anyway (e.g. a URL linked to from
// outside the site) — belt and braces, neither alone is sufficient.
const PRIVATE_PATHS = [
  'admin',
  'cart',
  'checkout',
  'login',
  'register',
  'account',
  'orders',
  'favourites',
  'forgot-password',
  'reset-password',
  'verify-email',
  'confirm-email-change',
  'ali-admin-login',
  'drive-connect-result',
  'dev',
];
const noindexHeaderRules = ['en', 'ar'].flatMap((locale) =>
  PRIVATE_PATHS.map((path) => ({
    source: `/${locale}/${path}/:rest*`,
    headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
  }))
);

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  // Belt-and-braces clickjacking cover alongside `frame-ancestors`.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  // Only honoured over HTTPS; harmless (ignored) on the plain-http dev server.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  // Drop the framework-fingerprinting `X-Powered-By: Next.js` header.
  poweredByHeader: false,
  // Next's default (60s) is tuned for typical dev/CI hardware — a handful of
  // the heavier admin pages (Recharts analytics dashboards, the big settings/
  // products/roles forms) consistently exceeded it on Netlify's shared build
  // machines even after Next's own 3 retries, despite building fine locally
  // and in GitHub Actions. Raised rather than chasing which specific pages
  // are slow this run — the failing subset shifts build-to-build under
  // resource contention, not a fixed one.
  staticPageGenerationTimeout: 180,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }, ...noindexHeaderRules];
  },
  images: {
    loader: 'custom',
    loaderFile: './src/lib/imagekit-loader.ts',
    // Tuned to this app's actual breakpoints/variants (see lib/imagekit-url.ts's
    // IMAGE_VARIANTS) rather than Next's generic defaults, so the srcset widths
    // next/image generates for a `sizes`-annotated image line up with sizes
    // ImageKit (and its CDN cache) actually sees repeated across the site —
    // nothing here ever needs to go past the 2000px zoom variant.
    deviceSizes: [400, 600, 828, 1080, 1200, 1920, 2000],
    imageSizes: [80, 120, 160, 256, 300],
  },
  // Same same-origin-cookie proxy netlify.toml's [[redirects]] already does
  // for the Netlify deploy (see that file's comment — SameSite=Strict auth/
  // CSRF/cart cookies never round-trip cross-site). Netlify's own edge
  // redirect intercepts /api/* before it ever reaches this Next.js server,
  // so this rewrite is dead code there; on a host with no such edge-redirect
  // layer (Cloudflare Workers via OpenNext), it's the only mechanism, so it
  // has to live here instead of in a host-specific config file. Only active
  // when API_SERVER_URL is actually set — unset in local dev, where the
  // browser already talks to the backend directly (see apiOrigin above).
  async rewrites() {
    const backendUrl = process.env.API_SERVER_URL;
    if (!backendUrl) return [];
    return [{ source: '/api/:path*', destination: `${backendUrl.replace(/\/+$/, '')}/api/:path*` }];
  },
};

// `ANALYZE=true npm run build` (or `npm run analyze`) emits the interactive
// treemap reports under .next/analyze/ — use it to confirm the storefront
// chunk stays lean (no admin-only Recharts / analytics kit leaking in).
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default withBundleAnalyzer(nextConfig);

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
