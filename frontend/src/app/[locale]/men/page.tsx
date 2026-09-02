import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: category grid + product listing for the Men department,
// styled per data-department="men" tokens (structured/editorial, Saxon-like).
export default function MenPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'رجالي' : 'Men'} department="men" />;
}
