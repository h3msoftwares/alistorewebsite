import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

// robots.txt is public — anything listed here is advertised to anyone who
// reads it, so only ordinary shopper-flow paths belong in this list. Admin,
// staff-login and internal routes are deliberately omitted; they stay out of
// the index via the X-Robots-Tag: noindex header in next.config.mjs, which
// does not reveal them. Every entry matches by prefix per the robots.txt spec,
// locale-prefixed since every real route is.
const PRIVATE_PATHS = [
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
