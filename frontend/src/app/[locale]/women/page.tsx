import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: category grid + product listing for the Women department
// (lingerie, nightwear), styled per data-department="women" tokens.
export default async function WomenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'حريمي' : 'Women'} department="women" />;
}
