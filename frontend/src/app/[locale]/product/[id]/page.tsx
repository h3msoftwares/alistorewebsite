import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: product detail — image gallery, size/color picker, add-to-cart,
// stock status. Fetch by params.id from GET /api/products/:id.
export default function ProductDetailPage({ params }: { params: { locale: string; id: string } }) {
  return <PagePlaceholder title="Product" note={`id: ${params.id}`} />;
}
