import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: category grid + product listing for the Men department,
// styled per data-department="men" tokens (structured/editorial, Saxon-like).
export default async function MenPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'رجالي' : 'Men'} department="men" />;
}
