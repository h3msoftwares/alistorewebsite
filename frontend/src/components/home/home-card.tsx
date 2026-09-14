'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, CatalogImage, PriceTag, SizeChip, Swatch } from '@/components/ui';
import {
  HOVER_SCROLL_MS,
  colorNameLabel,
  colorNameToCss,
  getColorOptions,
  getSizeOptions,
  isOptionOutOfStock,
  pickImageGallery,
} from '@/lib/product-variants';
import type { Product } from '@/lib/types';

/**
 * The card used in the home page's horizontal rows. Same footprint and
 * styling as the products-list `ProductPreviewCard`, trimmed to what belongs
 * on the home page: sizes are static labels, there's no favourite / zoom /
 * add-to-cart. Colours ARE interactive — clicking a swatch picks that colour's
 * gallery — and hovering the photo auto-advances through that gallery, looping
 * until the pointer leaves (then it resets to the first shot). Two shapes on
 * one shell (`.home-card`):
 *   - `HomeProductCard` — a category row's product
 *   - `HomeCategoryCard` — a collection row's category (media + name only)
 */

export function HomeProductCard({
  product,
  locale,
  preload = false,
}: {
  product: Product;
  locale: 'en' | 'ar';
  /** Set for the first row of tiles (above the fold) so Next.js preloads the
   *  image instead of lazy-loading it — see ProductPreviewCard. */
  preload?: boolean;
}) {
  const isAr = locale === 'ar';
  const name = isAr ? product.nameAr : product.nameEn;
  const href = `/${locale}/product/${product.id}`;

  const sizes = getSizeOptions(product.variants);
  const colors = getColorOptions(product.variants);

  // null = shopper hasn't clicked a swatch — default to the first colour's gallery.
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [hovering, setHovering] = useState(false);

  const activeColor = selectedColor ?? colors[0] ?? null;
  // The gallery filters against `selectedColor` (the shopper's own click),
  // not `activeColor` — `activeColor` defaults to the first swatch purely so
  // it renders as visually "selected" before any click, and using that same
  // default for the gallery meant the generic/lead shot was excluded the
  // instant a product had any colour-tagged photo at all, unconditionally,
  // before the shopper touched anything (fix-list.md #7's broader-scope
  // finding).
  const gallery = pickImageGallery(product.images, selectedColor);

  const image = gallery[frame % gallery.length] ?? product.images[0];
  const salePrice = product.onSale ? product.effectivePrice : null;

  useEffect(() => {
    if (!hovering || gallery.length < 2) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % gallery.length), HOVER_SCROLL_MS);
    return () => clearInterval(id);
  }, [hovering, gallery.length]);

  return (
    <div className="card home-card">
      <div className="home-card__media-wrap">
        <Link
          href={href}
          className="home-card__media"
          onMouseEnter={() => {
            setHovering(true);
            if (gallery.length > 1) setFrame((f) => (f + 1) % gallery.length);
          }}
          onMouseLeave={() => {
            setHovering(false);
            setFrame(0);
          }}
        >
          {image && (
            <CatalogImage
              src={image.url}
              alt={(isAr ? image.altAr : image.altEn) ?? name}
              fill
              sizes="(max-width: 640px) 50vw, 14rem"
              preload={preload}
            />
          )}
          {salePrice != null && (
            <Badge variant="sale" className="home-card__sale-badge">
              {isAr ? 'تخفيض' : 'Sale'}
            </Badge>
          )}
          {gallery.length > 1 && (
            <span className="home-card__scrub" aria-hidden>
              {gallery.map((g, i) => (
                <span key={g.id} data-on={i === frame % gallery.length || undefined} />
              ))}
            </span>
          )}
        </Link>
      </div>

      <div className="card__body home-card__body">
        <Link href={href} className="home-card__name">
          {name}
        </Link>
        <PriceTag
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          salePrice={salePrice}
          locale={locale}
          showBadge={false}
        />

        {colors.length > 0 && (
          <div className="swatch-group home-card__swatches">
            {colors.map((color) => (
              <Swatch
                key={color}
                colorName={colorNameLabel(color, locale)}
                locale={locale}
                imageUrl={product.images.find((img) => img.color === color)?.url}
                swatchColor={colorNameToCss(color)}
                selected={activeColor === color}
                outOfStock={isOptionOutOfStock(product.variants, 'color', color, null)}
                onClick={() => {
                  setSelectedColor((c) => (c === color ? null : color));
                  setFrame(0);
                }}
              />
            ))}
          </div>
        )}

        {sizes.length > 0 && (
          <div className="chip-group home-card__chips">
            {sizes.map((size) => (
              <SizeChip key={size} readOnly outOfStock={isOptionOutOfStock(product.variants, 'size', size, null)}>
                {size}
              </SizeChip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function HomeCategoryCard({
  href,
  name,
  imageUrl,
  imageAlt,
}: {
  href: string;
  name: string;
  imageUrl?: string | null;
  imageAlt?: string;
}) {
  return (
    <Link href={href} className="card home-card home-card--category">
      <div className="home-card__media-wrap">
        <div className="home-card__media">
          {imageUrl ? (
            <CatalogImage src={imageUrl} alt={imageAlt ?? name} fill sizes="(max-width: 640px) 50vw, 14rem" />
          ) : (
            <span className="home-card__media-placeholder" aria-hidden />
          )}
        </div>
      </div>
      <div className="card__body home-card__body">
        <span className="home-card__name">{name}</span>
      </div>
    </Link>
  );
}
