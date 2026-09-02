import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: order detail + status timeline + cancel button (only while PENDING).
export default function OrderDetailPage({ params }: { params: { locale: string; id: string } }) {
  return <PagePlaceholder title="Order" note={`id: ${params.id}`} />;
}
