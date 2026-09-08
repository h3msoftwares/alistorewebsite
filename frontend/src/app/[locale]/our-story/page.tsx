import type { Metadata } from 'next';
import { OurStoryView } from './our-story-view';

export const metadata: Metadata = {
  title: 'Our story',
  description: 'How Ali’s Store began and what we care about.',
};

export default async function OurStoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <OurStoryView locale={locale === 'ar' ? 'ar' : 'en'} />;
}
