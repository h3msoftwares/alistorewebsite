import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: edit an existing product + adjust per-variant stock quantities.
export default function EditProductPage({ params }: { params: { id: string } }) {
  return <PagePlaceholder title="Edit Product" note={`id: ${params.id}`} />;
}
