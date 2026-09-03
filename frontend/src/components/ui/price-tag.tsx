export interface PriceTagProps {
  /** Prisma Decimal fields (Product.price/compareAtPrice) may arrive as a
   *  string once serialized over JSON — accept both. */
  price: number | string;
  compareAtPrice?: number | string | null;
  /** Post-sale price from the API (`Product.effectivePrice`). When lower than
   *  `price` it becomes the current price and `price` is struck through. */
  salePrice?: number | string | null;
  locale: 'en' | 'ar';
  /** Matches Order.currency's default in prisma/schema.prisma. */
  currency?: string;
  /** Set false when the sale badge is already shown elsewhere (e.g.
   *  ProductCard positions one over the image via .product-card__badge) so
   *  it isn't rendered twice. */
  showBadge?: boolean;
}

/** Renders the current price, and — when a sale (`salePrice`) or a higher
 *  `compareAtPrice` applies — a struck-through original price plus the
 *  `.badge--sale` pill defined in globals.css. */
export function PriceTag({
  price,
  compareAtPrice,
  salePrice,
  locale,
  currency = 'USD',
  showBadge = true,
}: PriceTagProps) {
  const base = Number(price);
  const sale = salePrice != null ? Number(salePrice) : null;
  const compare = compareAtPrice != null ? Number(compareAtPrice) : null;

  const current = sale != null && sale < base ? sale : base;
  const struck =
    sale != null && sale < base ? base : compare != null && compare > current ? compare : null;

  const format = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency',
    currency,
  });

  return (
    <span className="price-tag">
      <span className="price-tag__current">{format.format(current)}</span>
      {struck != null && (
        <>
          <span className="price-tag__compare">{format.format(struck)}</span>
          {showBadge && (
            <span className="badge badge--sale">{locale === 'ar' ? 'تخفيض' : 'Sale'}</span>
          )}
        </>
      )}
    </span>
  );
}
