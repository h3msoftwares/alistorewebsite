import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: category grid + product listing for the Women department
// (lingerie, nightwear), styled per data-department="women" tokens.
export default function WomenPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'حريمي' : 'Women'} department="women" />;
}
