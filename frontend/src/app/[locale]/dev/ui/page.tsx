import { notFound } from 'next/navigation';
import { UiShowcase } from './showcase';

// Dev-only visual showcase for the design system + UI primitives — lets the
// team verify every component and state renders correctly in both locales /
// directions before real pages consume them. Delete this route once the
// storefront is built out.
export default async function UiShowcasePage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <UiShowcase locale={locale} />;
}
