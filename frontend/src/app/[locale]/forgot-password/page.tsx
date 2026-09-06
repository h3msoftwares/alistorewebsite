import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

// Shared across every role (customer, staff, admin) — one flow, not
// role-specific. Reachable directly by URL; not linked from the storefront
// nav, only from the login forms and the account page's Password section.
// `?return=account` marks the flow as started by a signed-in user, so the
// reset-password success screen sends them back to /account.
export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  const sp = await searchParams;
  const returnTo = sp.return === 'account' ? `/${locale}/account` : null;
  return <ForgotPasswordForm locale={locale} returnTo={returnTo} />;
}
