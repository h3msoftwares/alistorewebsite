export interface PriceTagProps {
  /** Prisma Decimal fields (Product.price/compareAtPrice) may arrive as a
   *  string once serialized over JSON — accept both until real API wiring
   *  in Week 2 settles the exact shape. */
  price: number | string;
  compareAtPrice?: number | string | null;
  locale: 'en' | 'ar';
  /** Matches Order.currency's default in prisma/schema.prisma. */
  currency?: string;
  /** Set false when the sale badge is already shown elsewhere (e.g.
   *  ProductCard positions one over the image via .product-card__badge) so
   *  it isn't rendered twice. */
  showBadge?: boolean;
}

/** Renders the current price, and — when compareAtPrice is higher — a
 *  struck-through original price plus the .badge--sale pill already
 *  defined in globals.css. */
export function PriceTag({ price, compareAtPrice, locale, currency = 'USD', showBadge = true }: PriceTagProps) {
  const numericPrice = Number(price);
  const numericCompare = compareAtPrice != null ? Number(compareAtPrice) : null;
  const onSale = numericCompare != null && numericCompare > numericPrice;

  const format = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency',
    currency,
  });

  return (
    <span className="price-tag">
      <span className="price-tag__current">{format.format(numericPrice)}</span>
      {onSale && (
        <>
          <span className="price-tag__compare">{format.format(numericCompare!)}</span>
          {showBadge && <span className="badge badge--sale">{locale === 'ar' ? 'تخفيض' : 'Sale'}</span>}
        </>
      )}
    </span>
  );
}
