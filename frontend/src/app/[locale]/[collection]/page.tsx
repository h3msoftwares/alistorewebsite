import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalogApi } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { accentStyle } from '@/lib/collections';
import { CategoryCard } from '@/components/home/category-card';
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
      <header className="container section collection-page__head">
        <h1 className="collection-page__title">{name}</h1>
        {description && <p className="collection-page__lede prose">{description}</p>}
      </header>

      {categories.length > 0 && (
        <section className="container section--tight" aria-label={isAr ? 'الفئات' : 'Categories'}>
          <h2 className="collection-page__subhead">
            {isAr ? 'تسوّق حسب الفئة' : 'Shop by category'}
          </h2>
          <ul className="category-grid" role="list">
            {categories.map((cat) => (
              <li key={cat.id}>
                <CategoryCard
                  href={`/${locale}/${col.slug}?category=${cat.slug}`}
                  name={isAr ? cat.nameAr : cat.nameEn}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <CollectionProducts collectionId={col.id} locale={locale} />
    </div>
  );
}
