'use client';

import Link from 'next/link';
import { CatalogImage } from '@/components/ui';
import { useReveal } from '@/hooks/use-reveal';
import type { HomeGrid } from '@/lib/types';

/** An owner-built grid on the home page: its categories side by side, as
 *  many per row as the screen fits (more wrap onto further rows), each a
 *  photo tile with the name laid
 *  over it, linking to the category's page. Slotted into the featured-row
 *  order by `sortOrder`; the grid's title is an admin-only label. Hidden
 *  tiles (inactive / archived categories) are skipped; with fewer than 2
 *  left the grid isn't a grid any more, so it renders nothing. */
export function CategoryGrid({
  locale,
  grid,
  delayMs = 0,
}: {
  locale: string;
  grid: HomeGrid;
  delayMs?: number;
}) {
  const isAr = locale === 'ar';
  const [ref, revealClass, revealStyle] = useReveal(delayMs);
  const tiles = grid.items.filter((it) => !it.category.hidden).map((it) => it.category);

  if (tiles.length < 2) return null;

  return (
    <section ref={ref} className={`home-row home-grid ${revealClass}`} style={revealStyle}>
      <div className="container home-grid__track">
        {tiles.map((c) => {
          const name = isAr ? c.nameAr : c.nameEn;
          const image = c.images[0];
          return (
            <Link key={c.id} href={`/${locale}/category/${c.slug}`} className="home-grid__tile">
              {image ? (
                <CatalogImage
                  src={image.url}
                  alt={(isAr ? image.altAr : image.altEn) ?? name}
                  fill
                  sizes="(max-width: 699px) 50vw, (max-width: 1279px) 34vw, 25vw"
                />
              ) : (
                <span className="home-grid__placeholder" aria-hidden />
              )}
              <span className="home-grid__name">{name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
