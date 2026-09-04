import { ProductDetail } from '@/components/product/product-detail';

// Server shell only — narrows `locale` to the union as a value comparison
// (see app/[locale]/layout.tsx's comment on why not a type-level narrow),
// then hands off to the client component that owns data fetching/selection
// state via useProduct()/useAddToCart().
export default async function ProductDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return <ProductDetail id={id} locale={locale === 'ar' ? 'ar' : 'en'} />;
}
