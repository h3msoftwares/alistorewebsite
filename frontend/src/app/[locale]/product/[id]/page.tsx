import { ProductDetail } from '@/components/product/product-detail';

// Server shell only — narrows `locale` to the union as a value comparison
// (see app/[locale]/layout.tsx's comment on why not a type-level narrow),
// then hands off to the client component that owns data fetching/selection
// state via useProduct()/useAddToCart().
export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  // ?color=&size= pre-select a variant from a deep/shared link (fix-list.md
  // #20, resolves 3.7) — read server-side, same as `params`, and handed down
  // as plain props rather than the client component calling useSearchParams()
  // itself (which would need its own Suspense boundary for no real benefit
  // here).
  searchParams: Promise<{ color?: string | string[]; size?: string | string[] }>;
}) {
  const { locale, id } = await params;
  const { color, size } = await searchParams;
  return (
    <ProductDetail
      id={id}
      locale={locale === 'ar' ? 'ar' : 'en'}
      initialColor={Array.isArray(color) ? color[0] : color}
      initialSize={Array.isArray(size) ? size[0] : size}
    />
  );
}
