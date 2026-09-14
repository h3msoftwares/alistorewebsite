'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Heart, ShoppingBag, ZoomIn } from 'lucide-react';
import { useFavourites } from '@/hooks/use-favourites';
import { useAddToCart } from '@/hooks/use-cart';
import { productToGaItem, trackAddToCart } from '@/lib/analytics/ga';
import { Badge, CatalogImage, Icon, PriceTag, SizeChip, Swatch } from '@/components/ui';
import { HOVER_SCROLL_MS, colorNameLabel, colorNameToCss, isOptionOutOfStock, pickImageGallery } from '@/lib/product-variants';
import type { Product } from '@/lib/types';
import { ProductZoomModal } from './product-zoom-modal';

// Unique, sorted, defined values only — `variants` may have null size/color
// (one-size / no-colour products).
function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
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

  // Hover-scroll through the shown colour's gallery — same behaviour as the
  // home page's HomeProductCard (see pickImageGallery's doc comment).
  const [frame, setFrame] = useState(0);
  const [hovering, setHovering] = useState(false);

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

  // Colour-tagged photos take over when that colour is selected; otherwise
  // the generic (untagged) shots; falling back to every photo if a product
  // only has colour-tagged ones and none match yet.
  //
  // Filters against `selectedColor` (the shopper's own click), NOT
  // `effectiveColor` — `effectiveColor` defaults to `firstVariant?.color`
  // purely for pricing/variant-resolution before any click (same reasoning
  // as the comment on sizeSoldOut/colorSoldOut below), and using that same
  // default here meant the card's generic/lead photo was excluded the
  // instant a product had any colour-tagged variant at all, unconditionally,
  // before the shopper touched anything (fix-list.md #7's broader-scope
  // finding, alongside 3.3's product-page version of the same bug).
  const gallery = useMemo(() => pickImageGallery(product.images, selectedColor), [product, selectedColor]);
  const image = gallery[frame % gallery.length] ?? product.images[0];

  useEffect(() => {
    if (!hovering || gallery.length < 2) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % gallery.length), HOVER_SCROLL_MS);
    return () => clearInterval(id);
  }, [hovering, gallery.length]);

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
      <div
        className="product-preview-card__media-wrap"
        onMouseEnter={() => {
          setHovering(true);
          if (gallery.length > 1) setFrame((f) => (f + 1) % gallery.length);
        }}
        onMouseLeave={() => {
          setHovering(false);
          setFrame(0);
        }}
      >
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
          {gallery.length > 1 && (
            <span className="product-preview-card__scrub" aria-hidden>
              {gallery.map((g, i) => (
                <span key={g.id} data-on={i === frame % gallery.length || undefined} />
              ))}
            </span>
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
                colorName={colorNameLabel(color, locale)}
                locale={locale}
                imageUrl={product.images.find((img) => img.color === color)?.url}
                swatchColor={colorNameToCss(color)}
                selected={effectiveColor === color}
                outOfStock={colorSoldOut(color)}
                onClick={() => {
                  setSelectedColor(color);
                  setFrame(0);
                }}
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
