'use client';

import { useReveal } from '@/hooks/use-reveal';
import { accentStyle } from '@/lib/collections';
import type { Category } from '@/lib/types';
import { HorizontalScroller } from './horizontal-scroller';
import { HomeCategoryCard } from './home-card';

/** One featured-(top-level-category) row on the home page: the category's
 *  name (linking to its page) + a horizontal scroll of its child categories
 *  (image + name each, linking to the child's page). Used for both the
 *  curated "featured" zone and the "rest" zone below it — they render
 *  identically, only the data feeding them differs. Named for its pre-Stage-1
 *  role (Women/Men/Kids used to be Collections) — it renders a Category now,
 *  see the catalog redesign's nav/banner decision. `category.children` is
 *  already nested one level by the list endpoint, so no separate request. */
export function CollectionRow({
  locale,
  collection: category,
  delayMs = 0,
}: {
  locale: string;
  collection: Category;
  delayMs?: number;
}) {
  const isAr = locale === 'ar';
  const name = isAr ? category.nameAr : category.nameEn;
  const list = category.children ?? [];

  const [revealRef, revealClass, revealStyle] = useReveal(delayMs);

  if (list.length === 0) return null;

  return (
    <div
      ref={revealRef}
      className={revealClass}
      data-collection={category.slug}
      style={{ ...accentStyle(category.accentColor), ...revealStyle }}
    >
      <HorizontalScroller
        locale={locale}
        title={name}
        titleHref={`/${locale}/category/${category.slug}`}
        ariaLabel={name}
      >
        {list.map((cat) => (
          <HomeCategoryCard
            key={cat.id}
            href={`/${locale}/category/${cat.slug}`}
            name={isAr ? cat.nameAr : cat.nameEn}
            imageUrl={cat.images[0]?.url}
            imageAlt={(isAr ? cat.images[0]?.altAr : cat.images[0]?.altEn) ?? undefined}
          />
        ))}
      </HorizontalScroller>
    </div>
  );
}
