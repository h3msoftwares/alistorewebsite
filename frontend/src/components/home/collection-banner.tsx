'use client';

import Link from 'next/link';
import { CatalogImage } from '@/components/ui';
import { useReveal } from '@/hooks/use-reveal';
import { accentStyle } from '@/lib/collections';
import type { Category } from '@/lib/types';

/**
 * A top-level category shown on the home page as a full-bleed image banner
 * (`showOnHomeAsImage`): a coloured panel — the category's `accentColor` —
 * carrying the description and a CTA button on one side, its base photo on
 * the other. Slots into the featured-row order by `sortOrder` (no longer
 * pinned to the top). Named for its pre-Stage-1 role (Women/Men/Kids used to
 * be Collections) — it renders a Category now, see the catalog redesign's
 * nav/banner decision.
 */
export function CollectionBanner({
  locale,
  collection,
  delayMs = 0,
}: {
  locale: string;
  collection: Category;
  delayMs?: number;
}) {
  const isAr = locale === 'ar';
  const name = isAr ? collection.nameAr : collection.nameEn;
  const description = (isAr ? collection.descriptionAr : collection.descriptionEn)?.trim() || null;
  const cta =
    (isAr ? collection.homeImageCtaAr : collection.homeImageCtaEn)?.trim() ||
    (isAr ? `تسوّق ${name}` : `Shop ${name}`);
  const image = collection.images[0];
  const href = `/${locale}/category/${collection.slug}`;
  const [ref, revealClass, revealStyle] = useReveal(delayMs);
  const titleId = `home-banner-${collection.id}`;

  return (
    <section
      ref={ref}
      className={`home-banner ${revealClass}`}
      style={{ ...accentStyle(collection.accentColor), ...revealStyle }}
      data-collection={collection.slug}
      aria-labelledby={titleId}
    >
      <div className="home-banner__panel">
        <p className="home-banner__eyebrow">{name}</p>
        <h2 id={titleId} className="home-banner__title">
          {description ?? name}
        </h2>
        <Link href={href} className="btn btn--accent home-banner__cta">
          {cta}
        </Link>
      </div>
      <Link href={href} className="home-banner__media" aria-label={name} tabIndex={-1}>
        {image ? (
          <CatalogImage
            src={image.url}
            alt={(isAr ? image.altAr : image.altEn) ?? name}
            fill
            sizes="(max-width: 899px) 100vw, 50vw"
          />
        ) : (
          <span className="home-banner__placeholder" aria-hidden />
        )}
      </Link>
    </section>
  );
}
