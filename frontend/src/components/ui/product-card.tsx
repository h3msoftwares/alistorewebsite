import Image from 'next/image';
import Link from 'next/link';
import { PriceTag } from './price-tag';

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
}

export interface ProductCardProps {
  product: ProductCardData;
  locale: 'en' | 'ar';
  /** Lowercase, matching the frontend's data-department convention (see
   *  globals.css) — NOT the backend's uppercase Department enum
   *  (WOMEN/MEN/KIDS). Whoever wires real API data in Week 2 needs to
   *  .toLowerCase() it first. */
  department?: 'women' | 'men' | 'kids';
}

/** Product tile used by department listing pages (Week 2) — built now so
 *  those pages can just import and consume it once they exist. Renders on
 *  top of the existing .card class from globals.css. */
export function ProductCard({ product, locale, department }: ProductCardProps) {
  const name = locale === 'ar' ? product.nameAr : product.nameEn;
  const image = product.images[0];
  const alt = (locale === 'ar' ? image?.altAr : image?.altEn) ?? name;
  const onSale = product.compareAtPrice != null && Number(product.compareAtPrice) > Number(product.price);

  return (
    <Link href={`/${locale}/product/${product.id}`} className="card product-card" data-department={department}>
      <div className="product-card__media">
        {image && <Image src={image.url} alt={alt} fill sizes="(max-width: 640px) 50vw, 25vw" />}
        {onSale && (
          <span className="badge badge--sale product-card__badge">{locale === 'ar' ? 'تخفيض' : 'Sale'}</span>
        )}
      </div>
      <div className="card__body">
        <p className="product-card__name">{name}</p>
        <PriceTag price={product.price} compareAtPrice={product.compareAtPrice} locale={locale} showBadge={false} />
      </div>
    </Link>
  );
}
