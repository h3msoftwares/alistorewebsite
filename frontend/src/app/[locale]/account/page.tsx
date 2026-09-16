import type { Metadata } from 'next';
import { AccountView } from './account-view';

export const metadata: Metadata = { title: 'My account' };

// Always auth-gated, session-dependent content — no page visitor ever sees a
// valid static shell, so it gains nothing from static prerendering and only
// costs build time (was consistently exceeding Next's static-generation
// timeout on Netlify's build machines).
export const dynamic = 'force-dynamic';

// Post-registration settings: edit name / phone, and manage delivery
// addresses (reuses the existing /api/addresses + /api/users/me endpoints).
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <AccountView locale={locale} />;
}
