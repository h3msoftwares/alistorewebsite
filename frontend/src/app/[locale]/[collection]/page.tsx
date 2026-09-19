import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalogApi } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { accentStyle } from '@/lib/collections';
import { absoluteUrl, buildOpenGraph, buildTwitter } from '@/lib/site';
import { breadcrumbJsonLd, itemListJsonLd } from '@/lib/structured-data';
import { CollectionProducts } from '@/components/collection/collection-products';
import { JsonLd } from '@/components/seo/json-ld';
import type { Collection } from '@/lib/types';

// Collections are DB-driven and edited at runtime, and the API may be
// unreachable during CI `next build` — so this route is always rendered on
// demand rather than pre-generated.
export const dynamic = 'force-dynamic';

type CollectionLoad = { status: 'ok'; collection: Collection } | { status: 'not-found' };

// A confirmed 404 (the slug genuinely matches nothing) -> notFound() below.
// Any other failure (including a timeout) rethrows — same reasoning as the
// category page's loadCategory: nothing here can render without `col`, so a
// transient 500 is a more honest signal than a false "this doesn't exist".
async function loadCollection(slug: string): Promise<CollectionLoad> {
  try {
    const collection = await catalogApi.getCollectionBySlug(slug, { signal: AbortSignal.timeout(8000) });
    return { status: 'ok', collection };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { status: 'not-found' };
    throw e;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}): Promise<Metadata> {
  const { locale, collection } = await params;
  const load = await loadCollection(collection);
  if (load.status !== 'ok') return {};
  const { collection: col } = load;
  const isAr = locale === 'ar';
  const name = isAr ? col.nameAr : col.nameEn;
  const description = (isAr ? col.descriptionAr : col.descriptionEn) ?? undefined;
  const url = absoluteUrl(`/${locale}/${col.slug}`);
  const image = col.images[0]?.url;

  return {
    title: name,
    description,
    alternates: {
      canonical: url,
      languages: { en: absoluteUrl(`/en/${col.slug}`), ar: absoluteUrl(`/ar/${col.slug}`) },
    },
    // buildOpenGraph/buildTwitter (lib/site.ts), not a partial object — see
    // their doc comment for why a bare `{title, description, url}` here
    // would silently lose the layout's default image/card/siteName.
    openGraph: buildOpenGraph({ title: name, description, url, locale: isAr ? 'ar' : 'en', image }),
    twitter: buildTwitter({ title: name, description, image }),
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}) {
  const { locale, collection } = await params;
  const load = await loadCollection(collection);
  if (load.status === 'not-found') notFound();
  const { collection: col } = load;

  const isAr = locale === 'ar';
  const name = isAr ? col.nameAr : col.nameEn;
  const description = isAr ? col.descriptionAr : col.descriptionEn;

  // Real visible content, capped for the JSON-LD blob's sake — the endpoint
  // itself doesn't paginate (a manually-curated collection is expected to
  // stay small), but ItemList only needs "what's on this page", not a
  // complete duplicate of every product. CollectionProducts below still
  // renders the full set independently.
  let itemList: ReturnType<typeof itemListJsonLd> | null = null;
  try {
    const products = await catalogApi.listCollectionProducts(col.id);
    if (products.length > 0) {
      itemList = itemListJsonLd(
        products.slice(0, 24).map((p) => ({
          name: isAr ? p.nameAr : p.nameEn,
          url: absoluteUrl(`/${locale}/product/${p.id}`),
        }))
      );
    }
  } catch {
    // Backend unreachable/slow — the visible page still renders (and
    // CollectionProducts still fetches client-side); just no ItemList for
    // this one request.
  }

  const crumbs = [
    { name: isAr ? 'الرئيسية' : 'Home', url: absoluteUrl(`/${locale}`) },
    { name },
  ];

  return (
    <div className="collection-page" data-collection={col.slug} style={accentStyle(col.accentColor)}>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {itemList && <JsonLd data={itemList} />}

      {description && (
        <p className="container collection-page__lede prose">{description}</p>
      )}

      {/* A Collection is a flat, manually-curated product group now (Stage 1
          of the catalog redesign) — no nested categories to also list here
          the way the old Collection -> Category hierarchy did. */}
      <CollectionProducts collectionId={col.id} locale={locale} name={name} />
    </div>
  );
}
