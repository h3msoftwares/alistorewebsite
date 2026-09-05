import Link from 'next/link';
import { CatalogImage } from '@/components/ui';

/** A single image + name tile — a category inside a collection row, a
 *  product inside a category row, or a category inside a listing page's
 *  grid. Falls back to a soft gradient placeholder when there's no image yet
 *  (categories/products don't require one). */
export function MediaTile({
  href,
  name,
  imageUrl,
  imageAlt,
  className,
}: {
  href: string;
  name: string;
  imageUrl?: string | null;
  imageAlt?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={['media-tile', 'card', className].filter(Boolean).join(' ')}>
      <div className="media-tile__media">
        {imageUrl ? (
          <CatalogImage src={imageUrl} alt={imageAlt ?? name} fill sizes="(max-width: 640px) 45vw, 220px" />
        ) : (
          <span className="media-tile__media-placeholder" aria-hidden />
        )}
      </div>
      <span className="media-tile__name">{name}</span>
    </Link>
  );
}
