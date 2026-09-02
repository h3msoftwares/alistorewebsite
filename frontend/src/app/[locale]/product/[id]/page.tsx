import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: product detail — image gallery, size/color picker, add-to-cart,
// stock status. Fetch by id from GET /api/products/:id.
export default async function ProductDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  return <PagePlaceholder title="Product" note={`id: ${id}`} />;
}
