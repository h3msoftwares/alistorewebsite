import Image from 'next/image';
import Link from 'next/link';
import { PriceTag } from './price-tag';
import { Badge } from './badge';

export interface ProductCardImage {
  url: string;
  altEn?: string | null;
  altAr?: string | null;
  sortOrder?: number;
}

export interface ProductCardData {
  id: string;
  nameEn: string;
  nameAr: string;
  price: number | string;
  compareAtPrice?: number | string | null;
  images: ProductCardImage[];
  /** Optional inline size availability, e.g. "S · M · L" (Saxon shows this on the card). */
  sizes?: string[];
}

export interface ProductCardProps {
  product: ProductCardData;
  locale: 'en' | 'ar';
  /** Storefront collection slug (e.g. "women"). Only used to key the compound
   *  visual accent via `data-collection` in globals.css. */
  collection?: string;
}

/** Product tile for collection listing pages. Renders on the shared .card /
 *  .product-card classes, with a two-image hover swap when a second image
 *  exists and a "Save $X" badge on sale items. */
export function ProductCard({ product, locale, collection }: ProductCardProps) {
  const isAr = locale === 'ar';
  const name = isAr ? product.nameAr : product.nameEn;
  const [image, hoverImage] = product.images;
  const alt = (isAr ? image?.altAr : image?.altEn) ?? name;

  const price = Number(product.price);
  const compare = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  const onSale = compare != null && compare > price;

  const saveFmt = new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'USD' });

  return (
    <Link href={`/${locale}/product/${product.id}`} className="card product-card" data-collection={collection}>
      <div className="product-card__media">
        {image && <Image src={image.url} alt={alt} fill sizes="(max-width: 640px) 50vw, 25vw" />}
        {hoverImage && <Image src={hoverImage.url} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" />}
        {onSale && (
          <Badge variant="save" className="product-card__badge">
            {isAr ? `توفير ${saveFmt.format(compare! - price)}` : `Save ${saveFmt.format(compare! - price)}`}
          </Badge>
        )}
      </div>
      <div className="card__body">
        <p className="product-card__name">{name}</p>
        <PriceTag price={product.price} compareAtPrice={product.compareAtPrice} locale={locale} showBadge={false} />
        {product.sizes && product.sizes.length > 0 && (
          <p className="product-card__sizes">
            {(isAr ? 'المقاسات: ' : 'Sizes: ') + product.sizes.join(' · ')}
          </p>
        )}
      </div>
    </Link>
  );
}
