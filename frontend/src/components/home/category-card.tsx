import Link from 'next/link';

/** A single category tile in a collection's grid: media + name. Structure only
 *  — the media area is a placeholder box. TODO: render the category's base
 *  image with next/image once category images exist. */
export function CategoryCard({ href, name }: { href: string; name: string }) {
  return (
    <Link href={href} className="category-card card">
      <div className="category-card__media">
        <span className="category-card__media-placeholder" aria-hidden />
      </div>
      <span className="category-card__name">{name}</span>
    </Link>
  );
}
