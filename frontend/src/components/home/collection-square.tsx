'use client';

import Link from 'next/link';
import { CatalogImage } from '@/components/ui';
import { useReveal } from '@/hooks/use-reveal';
import { accentStyle } from '@/lib/collections';
import type { Collection } from '@/lib/types';

/** A large square image standing in for a whole collection at the top of the
 *  home page — no category row. The collection name sits at the top-inline-start
 *  corner as a link to the collection. Opted in per-collection via
 *  `showOnHomeAsImage`; ordered by `sortOrder`. */
export function CollectionSquare({
  locale,
  collection,
  delayMs = 0,
}: {
  locale: string;
  collection: Collection;
  delayMs?: number;
}) {
  const isAr = locale === 'ar';
  const name = isAr ? collection.nameAr : collection.nameEn;
  const image = collection.images[0];
  const href = `/${locale}/${collection.slug}`;
  const [revealRef, revealClass, revealStyle] = useReveal(delayMs);

  return (
    <div
      ref={revealRef}
      className={`home-square ${revealClass}`}
      style={{ ...accentStyle(collection.accentColor), ...revealStyle }}
      data-collection={collection.slug}
    >
      <Link href={href} className="home-square__img" aria-label={name} tabIndex={-1}>
        {image ? (
          <CatalogImage
            src={image.url}
            alt={(isAr ? image.altAr : image.altEn) ?? name}
            fill
            sizes="(max-width: 899px) 100vw, 50vw"
          />
        ) : (
          <span className="home-square__placeholder" aria-hidden />
        )}
      </Link>
      <Link href={href} className="home-square__name">
        {name}
      </Link>
    </div>
  );
}
