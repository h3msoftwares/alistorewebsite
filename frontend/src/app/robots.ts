import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

// Same private-path list next.config.mjs's X-Robots-Tag block covers — kept
// here too (robots.txt disallow = don't even crawl; X-Robots-Tag = don't
// index what you do crawl) as defence in depth, not a substitute for either
// on its own: a disallowed-but-linked-from-elsewhere URL can still get
// indexed by URL alone without ever being crawled, which only the header
// actually prevents. Every entry matches by prefix per the robots.txt spec
// (`/en/admin` already covers `/en/admin/products`, no trailing wildcard
// needed), locale-prefixed since every real route is.
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

export default function robots(): MetadataRoute.Robots {
  const disallow = ['en', 'ar'].flatMap((locale) => PRIVATE_PATHS.map((path) => `/${locale}/${path}`));

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow,
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
