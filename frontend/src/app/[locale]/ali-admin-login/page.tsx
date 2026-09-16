import type { Metadata } from 'next';
import { AdminLoginForm } from './admin-login-form';

// Admin-only entry point on a deliberately non-obvious path so blanket
// admin-panel scanners don't find it by guessing. Not linked from any
// storefront nav and kept out of search indexes — you reach it by knowing
// the URL. On success it redirects to /admin.
export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false },
};

// Always auth-gated, session-dependent content — no page visitor ever sees a
// valid static shell, so it gains nothing from static prerendering and only
// costs build time (was consistently exceeding Next's static-generation
// timeout on Netlify's build machines).
export const dynamic = 'force-dynamic';

export default async function AliAdminLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <AdminLoginForm locale={locale} />;
}
