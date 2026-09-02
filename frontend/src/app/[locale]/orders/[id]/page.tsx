import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: order detail + status timeline + cancel button (only while PENDING).
export default async function OrderDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  return <PagePlaceholder title="Order" note={`id: ${id}`} />;
}
