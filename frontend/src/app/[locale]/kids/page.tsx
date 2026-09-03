import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: category grid + product listing for the "kids" collection,
// styled per data-collection="kids" tokens (playful/rounded).
export default async function KidsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'أطفال' : 'Kids'} collection="kids" />;
}
