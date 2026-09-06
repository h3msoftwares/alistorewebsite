import type { Metadata } from 'next';
import { VerifyEmailView } from './verify-email-view';

export const metadata: Metadata = { title: 'Verify email' };

// The link the verification email sends: /{locale}/verify-email?token=...
export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  const { token } = await searchParams;
  return <VerifyEmailView locale={locale} token={token ?? ''} />;
}
