import Link from 'next/link';

export interface Crumb {
  label: string;
  /** Omit for the current page — rendered as the page's <h1>, not a link.
   *  Also omit for a non-current crumb that has nothing to link to (e.g. an
   *  archived category whose own listing page 404s) — it renders as plain
   *  text instead of a dead link. */
  href?: string;
}

/** Route breadcrumb — Home / Collection / Category — that also carries the
 *  page's <h1> (the last, current crumb) by default. Sits beside the filter
 *  panel in the products toolbar, so it stays compact/inline rather than
 *  looking like a standalone heading. */
export function Breadcrumb({
  items,
  ariaLabel,
  currentAsHeading = true,
}: {
  items: Crumb[];
  ariaLabel: string;
  /** Set false when the page already has its own <h1> elsewhere (e.g. the
   *  product detail page's large title) — the current crumb then renders as
   *  plain text instead of a second, competing <h1>. */
  currentAsHeading?: boolean;
}) {
  return (
    <nav className="breadcrumb" aria-label={ariaLabel}>
      <ol className="breadcrumb__list">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="breadcrumb__item">
              {isLast ? (
                currentAsHeading ? (
                  <h1 className="breadcrumb__current">{item.label}</h1>
                ) : (
                  <span className="breadcrumb__current">{item.label}</span>
                )
              ) : item.href ? (
                <Link href={item.href} className="breadcrumb__link">
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumb__link breadcrumb__link--disabled">{item.label}</span>
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
