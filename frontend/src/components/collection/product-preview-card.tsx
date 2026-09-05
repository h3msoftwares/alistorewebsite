'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Heart, ShoppingBag, ZoomIn } from 'lucide-react';
import { useFavourites } from '@/hooks/use-favourites';
import { useAddToCart } from '@/hooks/use-cart';
import { productToGaItem, trackAddToCart } from '@/lib/analytics/ga';
import { Badge, CatalogImage, Icon, PriceTag, SizeChip, Swatch } from '@/components/ui';
import { isOptionOutOfStock } from '@/lib/product-variants';
import type { Product } from '@/lib/types';
import { ProductZoomModal } from './product-zoom-modal';

// Unique, sorted, defined values only — `variants` may have null size/color
// (one-size / no-colour products).
function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

// Best-effort colour name -> CSS colour, used when no colour-tagged photo
// exists for a swatch. Stripping spaces lets multi-word names resolve to a
// real CSS keyword ("Light Blue" -> "lightblue"). An unmapped name (e.g.
// "Assorted") is passed through as-is — the browser just ignores an invalid
// value and the swatch falls back to its plain surface colour; the name is
// still readable via the swatch's tooltip/aria-label.
function colorToCss(name: string): string {
  return name.replace(/[\s_-]+/g, '').toLowerCase();
}

/**
 * The product tile used in a collection/category page's grid — a step up
 * from the plain `<ProductCard>`: favourite + add-to-cart icons, size
 * buttons, and round colour swatches (a colour's tagged product photo when
 * one exists, else a best-effort flat colour) that together pick a specific
 * variant right on the card — swatch swaps the card's photo too — all
 * without leaving the listing.
 */
export function ProductPreviewCard({
  product,
  locale,
  preload = false,
}: {
  product: Product;
  locale: 'en' | 'ar';
  /** Set for the first row of a grid (above the fold) so Next.js preloads
   *  that image instead of lazy-loading it — leave false for every other
   *  card, or the point of preloading a specific image gets lost. Named to
   *  match next/image's own `preload` prop it forwards to — `priority` was
   *  deprecated in Next 16 and is silently a no-op there. */
  preload?: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { isFavourited, toggleFavourite, pendingId: favouritePendingId } = useFavourites();
  const addToCart = useAddToCart();
  const [zoomOpen, setZoomOpen] = useState(false);
  // Bumped on every open so <ProductZoomModal> remounts with fresh zoom
  // state instead of resuming whatever pan/zoom was left over last time.
  const [zoomKey, setZoomKey] = useState(0);

  // null = "not touched by the shopper yet" — falls back to the first
  // variant's size/colour below, derived at render (no effect needed).
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const sizes = useMemo(() => uniqueSorted(product.variants.map((v) => v.size)), [product]);
  const colors = useMemo(() => uniqueSorted(product.variants.map((v) => v.color)), [product]);

  const firstVariant = product.variants[0];
  const effectiveSize = selectedSize ?? firstVariant?.size ?? null;
  const effectiveColor = selectedColor ?? firstVariant?.color ?? null;

  const selectedVariant = useMemo(
    () =>
      product.variants.find(
        (v) =>
          (sizes.length === 0 || v.size === effectiveSize) &&
          (colors.length === 0 || v.color === effectiveColor)
      ),
    [product, sizes, colors, effectiveSize, effectiveColor]
  );

  // Colour-tagged photo takes over when that colour is selected; otherwise
  // the generic (untagged) shots; falling back to whatever's first if a
  // product only has colour-tagged photos and none match yet.
  const image = useMemo(() => {
    const forColor = effectiveColor ? product.images.filter((img) => img.color === effectiveColor) : [];
    if (forColor.length > 0) return forColor[0];
    const generic = product.images.find((img) => !img.color);
    return generic ?? product.images[0];
  }, [product, effectiveColor]);

  // Two-axis-aware: a size is only "in stock" if a variant exists with that
  // size AND whatever colour is currently selected (and vice versa) — the
  // same isOptionOutOfStock used on the product detail page. Checking each
  // axis alone (any variant with this size, in any colour) would mark a
  // combination available when the specific size/colour pair doesn't exist.
  //
  // Cross-checks against the shopper's actual `selectedSize`/`selectedColor`
  // (null until they've clicked something), NOT `effectiveSize`/`effectiveColor`
  // — those default to the first variant's values purely for pricing/image
  // purposes below, and cross-checking against an arbitrary default would
  // wrongly disable every option that doesn't happen to share an axis value
  // with that first variant, before the shopper has chosen anything.
  const sizeSoldOut = (size: string) => isOptionOutOfStock(product.variants, 'size', size, selectedColor);
  const colorSoldOut = (color: string) => isOptionOutOfStock(product.variants, 'color', color, selectedSize);

  const priceBase = selectedVariant?.price ?? product.price;
  const priceSale = selectedVariant
    ? selectedVariant.onSale
      ? (selectedVariant.effectivePrice ?? null)
      : null
    : product.onSale
      ? product.effectivePrice
      : null;

  const outOfStock = !selectedVariant || selectedVariant.stockQuantity <= 0;
  const favourited = isFavourited(product.id);
  const name = isAr ? product.nameAr : product.nameEn;
  const href = `/${locale}/product/${product.id}`;

  return (
    <div className="card product-preview-card">
      <div className="product-preview-card__media-wrap">
        <Link href={href} className="product-preview-card__media">
          {image && (
            <CatalogImage
              src={image.url}
              alt={(isAr ? image.altAr : image.altEn) ?? name}
              fill
              sizes="(max-width: 640px) 50vw, 25vw"
              preload={preload}
            />
          )}
          {priceSale != null && (
            <Badge variant="sale" className="product-preview-card__sale-badge">
              {t('Sale', 'تخفيض')}
            </Badge>
          )}
        </Link>

        <button
          type="button"
          className="icon-btn icon-btn--bordered product-preview-card__favourite"
          data-active={favourited || undefined}
          onClick={() => toggleFavourite(product.id)}
          disabled={favouritePendingId === product.id}
          aria-pressed={favourited}
          aria-label={favourited ? t('Remove from favourites', 'إزالة من المفضّلة') : t('Add to favourites', 'أضف إلى المفضّلة')}
        >
          <Icon as={Heart} size={16} fill={favourited ? 'currentColor' : 'none'} />
        </button>

        {image && (
          <button
            type="button"
            className="icon-btn icon-btn--bordered product-preview-card__zoom"
            onClick={() => {
              setZoomKey((k) => k + 1);
              setZoomOpen(true);
            }}
            aria-label={t('View larger image', 'عرض صورة أكبر')}
          >
            <Icon as={ZoomIn} size={16} />
          </button>
        )}
      </div>

      <div className="card__body product-preview-card__body">
        <Link href={href} className="product-preview-card__name">
          {name}
        </Link>
        <PriceTag price={priceBase} compareAtPrice={product.compareAtPrice} salePrice={priceSale} locale={locale} showBadge={false} />

        {colors.length > 0 && (
          <div className="swatch-group product-preview-card__swatches">
            {colors.map((color) => (
              <Swatch
                key={color}
                colorName={color}
                imageUrl={product.images.find((img) => img.color === color)?.url}
                swatchColor={colorToCss(color)}
                selected={effectiveColor === color}
                outOfStock={colorSoldOut(color)}
                onClick={() => setSelectedColor(color)}
              />
            ))}
          </div>
        )}

        {sizes.length > 0 && (
          <div className="chip-group product-preview-card__chips">
            {sizes.map((size) => (
              <SizeChip
                key={size}
                selected={effectiveSize === size}
                outOfStock={sizeSoldOut(size)}
                onClick={() => setSelectedSize(size)}
              >
                {size}
              </SizeChip>
            ))}
          </div>
        )}

        <button
          type="button"
          className="icon-btn icon-btn--bordered product-preview-card__add-to-cart"
          disabled={outOfStock || addToCart.isPending}
          data-loading={addToCart.isPending || undefined}
          onClick={() =>
            selectedVariant &&
            addToCart.mutate(
              { variantId: selectedVariant.id, quantity: 1 },
              { onSuccess: () => trackAddToCart(productToGaItem(product, selectedVariant, 1)) }
            )
          }
          aria-label={outOfStock ? t('Out of stock', 'غير متوفر') : t('Add to cart', 'أضف إلى السلة')}
        >
          <Icon as={ShoppingBag} size={16} />
        </button>
      </div>

      <ProductZoomModal
        key={zoomKey}
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        image={image}
        name={name}
        locale={locale}
      />
    </div>
  );
}
