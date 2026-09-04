import type { Metadata } from 'next';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

// Shared across every role (customer, staff, admin) — one flow, not
// role-specific. Reachable directly by URL; not linked from the storefront
// nav, only from the login forms.
export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <ForgotPasswordForm locale={locale} />;
}
