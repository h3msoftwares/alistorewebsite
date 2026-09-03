import Link from 'next/link';
import { CategoryCard } from './category-card';

export type SectionSurface = 'bg' | 'surface' | 'tint';

/**
 * One collection block on the home page: the collection name + a grid of the
 * categories that belong to it. Each block sits on its own background
 * (`surface`) so the collections read as separate, and carries `data-collection`
 * so headings pick up that door's accent (see globals.css §7).
 */
export function CollectionSection({
  locale,
  slug,
  name,
  surface = 'bg',
  categories,
}: {
  locale: string;
  slug: string;
  name: string;
  surface?: SectionSurface;
  categories: { slug: string; name: string }[];
}) {
  const isAr = locale === 'ar';

  return (
    <section
      className="collection-section"
      data-collection={slug}
      data-surface={surface}
      aria-labelledby={`col-${slug}`}
    >
      <div className="container">
        <header className="collection-section__head">
          <h2 id={`col-${slug}`} className="collection-section__title">
            {name}
          </h2>
          <Link href={`/${locale}/${slug}`} className="collection-section__all">
            {isAr ? 'عرض الكل' : 'View all'}
          </Link>
        </header>

        <ul className="category-grid" role="list">
          {categories.map((cat) => (
            <li key={cat.slug}>
              <CategoryCard href={`/${locale}/${slug}?category=${cat.slug}`} name={cat.name} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
