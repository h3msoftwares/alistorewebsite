'use client';

import { useSettings } from '@/hooks/use-settings';
import { useReveal } from '@/hooks/use-reveal';
import { HorizontalScroller } from './horizontal-scroller';

/**
 * "What customers say" strip, shown on the home page right below the "Visit
 * us" store-info block. Each tile is a screenshot of a real customer review,
 * uploaded by the admin/staff from /admin/settings → Customer reviews. Reuses
 * `HorizontalScroller` for the swipe / wheel / drag / arrow scrolling; the
 * `reviews-row` class widens the tiles so the text stays readable. The whole
 * section is omitted when no images have been added. Fades + rises into view
 * on scroll, same one-shot reveal as every other home-page block (see
 * hooks/use-reveal.ts) — `HorizontalScroller` doesn't forward a ref, so this
 * wraps it rather than merging the reveal class onto its own root.
 */
export function CustomerReviews({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const { data: settings } = useSettings();
  const [ref, revealClass, revealStyle] = useReveal();

  const images = settings?.reviewImages ?? [];
  if (images.length === 0) return null;

  return (
    <div ref={ref} className={revealClass} style={revealStyle}>
      <HorizontalScroller
        locale={locale}
        className="reviews-row"
        title={isAr ? 'ماذا يقول عملاؤنا' : 'What customers say'}
        ariaLabel={isAr ? 'آراء العملاء' : 'Customer reviews'}
      >
        {images.map((img, i) => (
          <figure key={img.id} className="review-tile">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.imageUrl}
              alt={isAr ? `مراجعة عميل ${i + 1}` : `Customer review ${i + 1}`}
              loading="lazy"
            />
          </figure>
        ))}
      </HorizontalScroller>
    </div>
  );
}
