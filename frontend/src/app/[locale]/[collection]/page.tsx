import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalogApi } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { accentStyle } from '@/lib/collections';
import { MediaTile } from '@/components/home/media-tile';
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
    title: `${isAr ? col.nameAr : col.nameEn} · Ali's Store`,
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
  const categories = col.categories ?? [];

  return (
    <div className="collection-page" data-collection={col.slug} style={accentStyle(col.accentColor)}>
      {description && (
        <p className="container collection-page__lede prose">{description}</p>
      )}

      {/* Products lead the page — the grid starts above the fold. The
          "shop by category" links move below it (secondary navigation). */}
      <CollectionProducts collectionId={col.id} locale={locale} name={name} />

      {categories.length > 0 && (
        <section
          className="container section--tight collection-page__categories"
          aria-label={isAr ? 'الفئات' : 'Categories'}
        >
          <h2 className="collection-page__subhead">
            {isAr ? 'تسوّق حسب الفئة' : 'Shop by category'}
          </h2>
          <ul className="category-grid" role="list">
            {categories.map((cat) => (
              <li key={cat.id}>
                <MediaTile
                  href={`/${locale}/category/${cat.slug}`}
                  name={isAr ? cat.nameAr : cat.nameEn}
                  imageUrl={cat.images[0]?.url}
                  imageAlt={(isAr ? cat.images[0]?.altAr : cat.images[0]?.altEn) ?? undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
