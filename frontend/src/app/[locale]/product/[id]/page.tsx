import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetail } from '@/components/product/product-detail';
import { JsonLd } from '@/components/seo/json-ld';
import { catalogApi } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { absoluteUrl, buildOpenGraph, buildTwitter } from '@/lib/site';
import { breadcrumbJsonLd, productJsonLd } from '@/lib/structured-data';
import type { Category, Product } from '@/lib/types';

type ProductLoad = { status: 'ok'; product: Product } | { status: 'not-found' } | { status: 'unknown' };

// Distinguishes a *confirmed* 404 (the product genuinely doesn't exist —
// notFound() below) from merely failing to confirm it in time (backend
// slow/unreachable) — an 8s timeout that mistakenly 404'd a real, live
// product because of a transient backend hiccup would be far worse than
// just rendering without server-side metadata/JSON-LD for that one request.
async function loadProduct(id: string): Promise<ProductLoad> {
  try {
    const product = await catalogApi.getProduct(id, { signal: AbortSignal.timeout(8000) });
    return { status: 'ok', product };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { status: 'not-found' };
    return { status: 'unknown' };
  }
}

/** Root-first ancestor chain, same shape the visible <Breadcrumb> in
 *  ProductDetail builds client-side — duplicated here because this runs in a
 *  separate server fetch/render pass with its own `product`. */
function productBreadcrumbs(product: Product, locale: string, isAr: boolean) {
  const categoryChain: Category[] = [];
  for (let c: Category | undefined = product.primaryCategory; c; c = c.parent ?? undefined) {
    categoryChain.unshift(c);
  }
  return [
    { name: isAr ? 'الرئيسية' : 'Home', url: absoluteUrl(`/${locale}`) },
    ...categoryChain.map((c) => ({
      name: isAr ? c.nameAr : c.nameEn,
      url: absoluteUrl(`/${locale}/category/${c.slug}`),
    })),
    { name: isAr ? product.nameAr : product.nameEn },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const isAr = locale === 'ar';
  const load = await loadProduct(id);
  // Nothing here (no title override, no canonical) rather than a 404-shaped
  // title — `notFound()` in the page component below (confirmed-missing
  // only, see loadProduct) is what actually fixes the response status for a
  // real 404; an 'unknown' (timeout) just renders with no server metadata,
  // same graceful degradation as everywhere else in this app.
  if (load.status !== 'ok') return {};
  const { product } = load;

  const name = isAr ? product.nameAr : product.nameEn;
  const description = (isAr ? product.descriptionAr : product.descriptionEn) ?? undefined;
  const url = absoluteUrl(`/${locale}/product/${id}`);
  // The bare canonical (no ?color=/&size=) — those params pre-select a
  // variant on an otherwise identical page, not a distinct product.
  const image = product.images[0]?.url;

  return {
    title: name,
    description,
    alternates: {
      canonical: url,
      languages: { en: absoluteUrl(`/en/product/${id}`), ar: absoluteUrl(`/ar/product/${id}`) },
    },
    // buildOpenGraph/buildTwitter (lib/site.ts), not a partial object — see
    // their doc comment for why a bare `{title, description, url}` here
    // would silently lose the layout's default image/card/siteName.
    openGraph: buildOpenGraph({ title: name, description, url, locale: isAr ? 'ar' : 'en', image }),
    twitter: buildTwitter({ title: name, description, image }),
  };
}

// Server shell — narrows `locale` to the union as a value comparison (see
// app/[locale]/layout.tsx's comment on why not a type-level narrow), fetches
// the product once here (existence check -> real notFound(); JSON-LD), then
// hands off to the client component that owns data fetching/selection state
// via its own useProduct()/useAddToCart(). That's a second, duplicate fetch
// of the same product — accepted deliberately: giving ProductDetail
// server-fetched initial data instead would mean threading hydration state
// through an already-complex, well-tested component for a cheap read.
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
  const isAr = locale === 'ar';

  const load = await loadProduct(id);
  // Was previously a 200 with a "Product not found" EmptyState rendered by
  // the client component — a soft 404 (real content-not-found, wrong HTTP
  // status) that search engines flag and may still index. This is the fix:
  // a *confirmed*-missing product now gets Next's real 404 response. A mere
  // timeout ('unknown') does NOT 404 — see loadProduct.
  if (load.status === 'not-found') notFound();

  return (
    <>
      {load.status === 'ok' && (
        <>
          <JsonLd data={productJsonLd(load.product, isAr ? 'ar' : 'en', absoluteUrl(`/${locale}/product/${id}`))} />
          <JsonLd data={breadcrumbJsonLd(productBreadcrumbs(load.product, locale, isAr))} />
        </>
      )}
      <ProductDetail
        id={id}
        locale={isAr ? 'ar' : 'en'}
        initialColor={Array.isArray(color) ? color[0] : color}
        initialSize={Array.isArray(size) ? size[0] : size}
      />
    </>
  );
}
