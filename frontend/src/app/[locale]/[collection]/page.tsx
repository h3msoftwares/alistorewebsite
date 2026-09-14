import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalogApi } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { accentStyle } from '@/lib/collections';
import { CollectionProducts } from '@/components/collection/collection-products';
import type { Collection } from '@/lib/types';

// Collections are DB-driven and edited at runtime, and the API may be
// unreachable during CI `next build` — so this route is always rendered on
// demand rather than pre-generated.
export const dynamic = 'force-dynamic';

async function loadCollection(slug: string): Promise<Collection | null> {
  try {
    return await catalogApi.getCollectionBySlug(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}): Promise<Metadata> {
  const { locale, collection } = await params;
  const col = await loadCollection(collection);
  if (!col) return {};
  const isAr = locale === 'ar';
  return {
    title: `${isAr ? col.nameAr : col.nameEn} · Ali'sStore`,
    description: (isAr ? col.descriptionAr : col.descriptionEn) ?? undefined,
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ locale: string; collection: string }>;
}) {
  const { locale, collection } = await params;
  const col = await loadCollection(collection);
  if (!col) notFound();

  const isAr = locale === 'ar';
  const name = isAr ? col.nameAr : col.nameEn;
  const description = isAr ? col.descriptionAr : col.descriptionEn;

  return (
    <div className="collection-page" data-collection={col.slug} style={accentStyle(col.accentColor)}>
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
