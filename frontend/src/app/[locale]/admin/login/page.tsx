import type { Metadata } from 'next';
import { AdminLoginForm } from './admin-login-form';

// Admin-only entry point. Deliberately not linked from any storefront nav
// (header/footer) and kept out of search indexes — you reach it by knowing
// the URL. On success it redirects to /admin (the existing dashboard stub).
export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <AdminLoginForm locale={locale} />;
}
