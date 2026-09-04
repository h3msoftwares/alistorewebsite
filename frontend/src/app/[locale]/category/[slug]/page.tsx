import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalogApi } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { accentStyle } from '@/lib/collections';
import { MediaTile } from '@/components/home/media-tile';
import { CategoryProducts } from '@/components/collection/category-products';
import type { Category } from '@/lib/types';

// Categories are DB-driven and edited at runtime (and a category can stand
// alone, unattached to any collection) — so this route is rendered on demand,
// never pre-generated. The `category/` path prefix keeps it from colliding with
// the bare `/[locale]/[collection]` slug route.
export const dynamic = 'force-dynamic';

async function loadCategory(slug: string): Promise<Category | null> {
  try {
    return await catalogApi.getCategoryBySlug(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const cat = await loadCategory(slug);
  if (!cat) return {};
  const isAr = locale === 'ar';
  return { title: `${isAr ? cat.nameAr : cat.nameEn} · Ali's Store` };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const cat = await loadCategory(slug);
  if (!cat) notFound();

  const isAr = locale === 'ar';
  const name = isAr ? cat.nameAr : cat.nameEn;
  const children = cat.children ?? [];
  const parentCollection = cat.collection ?? null;

  return (
    <div
      className="collection-page"
      data-collection={parentCollection?.slug}
      style={accentStyle(parentCollection?.accentColor)}
    >
      {children.length > 0 && (
        <section className="container section--tight" aria-label={isAr ? 'الفئات الفرعية' : 'Subcategories'}>
          <h2 className="collection-page__subhead">
            {isAr ? 'تصفّح' : 'Browse'}
          </h2>
          <ul className="category-grid" role="list">
            {children.map((child) => (
              <li key={child.id}>
                <MediaTile
                  href={`/${locale}/category/${child.slug}`}
                  name={isAr ? child.nameAr : child.nameEn}
                  imageUrl={child.images[0]?.url}
                  imageAlt={(isAr ? child.images[0]?.altAr : child.images[0]?.altEn) ?? undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <CategoryProducts
        categoryId={cat.id}
        locale={locale}
        name={name}
        collection={
          parentCollection
            ? { slug: parentCollection.slug, name: isAr ? parentCollection.nameAr : parentCollection.nameEn }
            : null
        }
      />
    </div>
  );
}
