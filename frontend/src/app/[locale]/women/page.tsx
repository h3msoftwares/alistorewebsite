import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: category grid + product listing for the "women" collection
// (resolve Collection.id via GET /api/collections, then GET /api/products
// ?collectionId=), styled per data-collection="women" tokens.
export default async function WomenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'حريمي' : 'Women'} collection="women" />;
}
