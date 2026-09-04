import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Reset password' };

// The link the forgot-password email sends: /{locale}/reset-password?token=...
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  const { token } = await searchParams;
  return <ResetPasswordForm locale={locale} token={token ?? ''} />;
}
