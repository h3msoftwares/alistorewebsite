import bundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV !== 'production';

// The API the browser talks to (fetch/XHR). Same value the client uses at
// runtime; needed here so `connect-src` can name it.
const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

// Optional: the ImageKit CDN host, if the owner has wired one up. Falls back
// to ImageKit's shared domain so product images load before a custom
// endpoint is configured.
let imagekitOrigin = 'https://ik.imagekit.io';
try {
  if (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT) {
    imagekitOrigin = new URL(process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT).origin;
  }
} catch {
  // malformed env → keep the default
}

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
    'img-src': ["'self'", 'data:', 'blob:', imagekitOrigin, ...GA, ...HCAPTCHA],
    'font-src': ["'self'", 'data:', ...HCAPTCHA],
    'connect-src': [
      "'self'",
      apiOrigin,
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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
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
};

// `ANALYZE=true npm run build` (or `npm run analyze`) emits the interactive
// treemap reports under .next/analyze/ — use it to confirm the storefront
// chunk stays lean (no admin-only Recharts / analytics kit leaking in).
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default withBundleAnalyzer(nextConfig);
