import type { Metadata } from 'next';
import { AccountView } from './account-view';

export const metadata: Metadata = { title: 'My account' };

// Post-registration settings: edit name / phone, and manage delivery
// addresses (reuses the existing /api/addresses + /api/users/me endpoints).
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <AccountView locale={locale} />;
}
