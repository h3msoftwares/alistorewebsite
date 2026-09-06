import type { Metadata } from 'next';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create account' };

// Storefront customer sign-up. Requires email + phone + a full delivery
// address up front, and sends an email-verification link — no session is
// created here (see useRegister). Links to /login.
export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <RegisterForm locale={locale} />;
}
