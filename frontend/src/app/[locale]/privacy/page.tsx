import type { Metadata } from 'next';
import { PrivacyView } from './privacy-view';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: "How Ali'sStore collects, uses, and protects your personal information.",
};

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <PrivacyView locale={locale === 'ar' ? 'ar' : 'en'} />;
}
