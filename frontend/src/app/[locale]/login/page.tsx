import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
};

// Storefront customer sign-in. Separate from the admin panel's /admin/login
// (different endpoint, rate limit and redirect). On success it goes to
// ?next= (a validated same-origin path) or the locale home.
export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  const { next } = await searchParams;
  return <LoginForm locale={locale} next={next ?? null} />;
}
