import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: edit an existing product (incl. quantity + sale) and adjust
// per-variant stock quantities. PATCH /api/products/:id.
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PagePlaceholder title="Edit Product" note={`id: ${id}`} />;
}
