import type { Metadata } from 'next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create account' };

// Storefront customer sign-up. Requires email + phone + a full delivery
// address up front, and sends an email-verification link — no session is
// created here (see useRegister). Links to /login. `?email=` (e.g. from the
// footer "Join" teaser) pre-fills the email field.
export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  const { email } = await searchParams;
  return <RegisterForm locale={locale} defaultEmail={typeof email === 'string' ? email : ''} />;
}
