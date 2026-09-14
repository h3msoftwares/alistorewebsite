import type { Metadata } from 'next';
import { ConfirmEmailChangeView } from './confirm-email-change-view';

export const metadata: Metadata = { title: 'Confirm email change' };

// The link the email-change confirmation email sends:
// /{locale}/confirm-email-change?token=...
export default async function ConfirmEmailChangePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  const { token } = await searchParams;
  return <ConfirmEmailChangeView locale={locale} token={token ?? ''} />;
}
