import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { catalogApi } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { accentStyle } from '@/lib/collections';
import { absoluteUrl, buildOpenGraph, buildTwitter } from '@/lib/site';
import { breadcrumbJsonLd, categoryItemName, itemListJsonLd } from '@/lib/structured-data';
import { MediaTile } from '@/components/home/media-tile';
import { CategoryProducts } from '@/components/collection/category-products';
import { JsonLd } from '@/components/seo/json-ld';
import type { Category } from '@/lib/types';

// Categories are DB-driven and edited at runtime (and a category can stand
// alone, unattached to any collection) — so this route is rendered on demand,
// never pre-generated. The `category/` path prefix keeps it from colliding with
// the bare `/[locale]/[collection]` slug route.
export const dynamic = 'force-dynamic';

type CategoryLoad = { status: 'ok'; category: Category } | { status: 'not-found' };

// A confirmed 404 (the slug genuinely matches nothing) -> notFound() below.
// Any other failure (including a timeout) rethrows same as before this file
// added one — unlike the product page, there's no client-side fallback that
// can render this page without `cat` (children/ancestors/accent all come
// from it), so there's nothing safe to degrade to; a transient 500 is a
// better signal to search engines here than a false "this doesn't exist".
async function loadCategory(slug: string): Promise<CategoryLoad> {
  try {
    const category = await catalogApi.getCategoryBySlug(slug, { signal: AbortSignal.timeout(8000) });
    return { status: 'ok', category };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { status: 'not-found' };
    throw e;
  }
}

function categoryBreadcrumbs(cat: Category, locale: string, isAr: boolean) {
  const ancestors: Category[] = [];
  for (let p = cat.parent; p; p = p.parent) ancestors.unshift(p);
  return [
    { name: isAr ? 'الرئيسية' : 'Home', url: absoluteUrl(`/${locale}`) },
    ...ancestors.map((a) => ({
      name: isAr ? a.nameAr : a.nameEn,
      url: absoluteUrl(`/${locale}/category/${a.slug}`),
    })),
    { name: isAr ? cat.nameAr : cat.nameEn },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const load = await loadCategory(slug);
  if (load.status !== 'ok') return {};
  const { category: cat } = load;
  const isAr = locale === 'ar';
  const name = isAr ? cat.nameAr : cat.nameEn;
  const description = (isAr ? cat.descriptionAr : cat.descriptionEn) ?? undefined;
  const url = absoluteUrl(`/${locale}/category/${slug}`);
  const image = cat.images[0]?.url;

  return {
    title: name,
    description,
    // The bare category URL only — filters/sort/pagination are client-side
    // state, never reflected in this route's URL, so there's nothing for a
    // query-string variant to canonicalize away in practice; set anyway as
    // the documented single source of truth for this page.
    alternates: {
      canonical: url,
      languages: { en: absoluteUrl(`/en/category/${slug}`), ar: absoluteUrl(`/ar/category/${slug}`) },
    },
    // buildOpenGraph/buildTwitter (lib/site.ts), not a partial object — see
    // their doc comment for why a bare `{title, description, url}` here
    // would silently lose the layout's default image/card/siteName.
    openGraph: buildOpenGraph({ title: name, description, url, locale: isAr ? 'ar' : 'en', image }),
    twitter: buildTwitter({ title: name, description, image }),
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const load = await loadCategory(slug);
  if (load.status === 'not-found') notFound();
  const { category: cat } = load;

  const isAr = locale === 'ar';
  const name = isAr ? cat.nameAr : cat.nameEn;
  const children = cat.children ?? [];
  // Root ancestor of this category (itself, if already a root) — plays the
  // old "parent Collection" role for page-header accent theming, since
  // Women/Men/Kids are top-level Categories now, not Collections.
  let root = cat;
  while (root.parent) root = root.parent;

  // Every ancestor between Home and this category, root-first (Women, Shoes,
  // Sport Shoes, ...) — the API already fetches this full chain (up to 4
  // levels) for exactly this purpose. A single "root ancestor" crumb was
  // fine while the tree was only ever 2 levels deep, but silently drops
  // every level in between once a category goes any deeper than that.
  const ancestors: { slug: string; name: string }[] = [];
  for (let p = cat.parent; p; p = p.parent) {
    ancestors.unshift({ slug: p.slug, name: isAr ? p.nameAr : p.nameEn });
  }

  // First page of this category's own products, fetched purely for the
  // ItemList's real visible content/order — CategoryProducts below does its
  // own full, paginated/filterable client-side fetch independently; this is
  // deliberately just the first screenful, not a duplicate of that.
  let itemList: ReturnType<typeof itemListJsonLd> | null = null;
  try {
    const firstPage = await catalogApi.listCategoryProducts(
      cat.id,
      { pageSize: 24 },
      { signal: AbortSignal.timeout(8000) }
    );
    if (firstPage.items.length > 0) {
      itemList = itemListJsonLd(
        firstPage.items.map((p) => ({
          name: isAr ? p.nameAr : p.nameEn,
          url: absoluteUrl(`/${locale}/product/${p.id}`),
        }))
      );
    }
  } catch {
    // Backend unreachable/slow — the visible page still renders (and
    // CategoryProducts still fetches client-side); just no ItemList for
    // this one request.
  }

  return (
    <div
      className="collection-page"
      data-collection={root.slug}
      style={accentStyle(root.accentColor)}
    >
      <JsonLd data={breadcrumbJsonLd(categoryBreadcrumbs(cat, locale, isAr))} />
      {itemList && <JsonLd data={itemList} />}

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
                  name={categoryItemName(child, isAr ? 'ar' : 'en')}
                  imageUrl={child.images[0]?.url}
                  imageAlt={(isAr ? child.images[0]?.altAr : child.images[0]?.altEn) ?? undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <CategoryProducts categoryId={cat.id} locale={locale} name={name} ancestors={ancestors} />
    </div>
  );
}
