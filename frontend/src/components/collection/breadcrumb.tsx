import Link from 'next/link';

export interface Crumb {
  label: string;
  /** Omit for the current page — rendered as the page's <h1>, not a link. */
  href?: string;
}

/** Route breadcrumb — Home / Collection / Category — that also carries the
 *  page's <h1> (the last, current crumb). Sits beside the filter panel in
 *  the products toolbar, so it stays compact/inline rather than looking
 *  like a standalone heading. */
export function Breadcrumb({ items, ariaLabel }: { items: Crumb[]; ariaLabel: string }) {
  return (
    <nav className="breadcrumb" aria-label={ariaLabel}>
      <ol className="breadcrumb__list">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="breadcrumb__item">
              {isLast ? (
                <h1 className="breadcrumb__current">{item.label}</h1>
              ) : (
                <Link href={item.href!} className="breadcrumb__link">
                  {item.label}
                </Link>
              )}
              {!isLast && (
                <span className="breadcrumb__sep" aria-hidden>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
