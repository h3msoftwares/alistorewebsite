import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: category grid + product listing for the Kids department,
// styled per data-department="kids" tokens (playful/rounded).
export default function KidsPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'أطفال' : 'Kids'} department="kids" />;
}
