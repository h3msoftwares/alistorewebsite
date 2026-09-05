'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Compass, Heart, ZoomIn } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  CatalogImage,
  EmptyState,
  Icon,
  PriceTag,
  QuantityStepper,
  Skeleton,
  SizeChip,
  Swatch,
} from '@/components/ui';
import { Breadcrumb, type Crumb } from '@/components/collection/breadcrumb';
import { ImageZoomModal } from './image-zoom-modal';
import { RelatedProducts } from './related-products';
import { productToGaItem, trackAddToCart, trackViewItem } from '@/lib/analytics/ga';
import { useProduct } from '@/hooks/use-catalog';
import { useAddToCart } from '@/hooks/use-cart';
import { useAuth } from '@/hooks/use-auth';
import { useFavourites } from '@/hooks/use-favourites';
import { isApiError } from '@/lib/api/errors';
import { formatCurrency } from '@/lib/format';
import {
  colorNameToCss,
  getColorOptions,
  getSizeOptions,
  hasColorAxis,
  hasSizeAxis,
  isOptionOutOfStock,
  resolveVariant,
} from '@/lib/product-variants';

export function ProductDetail({ id, locale }: { id: string; locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const query = useProduct(id);
  const addToCart = useAddToCart();
  const { isAdmin } = useAuth();
  const { isFavourited, toggleFavourite, pendingId: favouritePendingId } = useFavourites();

  const product = query.data;
  const variants = useMemo(() => product?.variants ?? [], [product]);

  const needsSize = hasSizeAxis(variants);
  const needsColor = hasColorAxis(variants);
  const sizeOptions = useMemo(() => getSizeOptions(variants), [variants]);
  const colorOptions = useMemo(() => getColorOptions(variants), [variants]);

  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (product) trackViewItem(productToGaItem(product));
  }, [product]);

  // Auto-pick the only option on an axis so a one-size/one-colour product
  // never shows a picker that requires clicking something with no choice.
  const effectiveSize = needsSize ? (size ?? (sizeOptions.length === 1 ? sizeOptions[0] : null)) : null;
  const effectiveColor = needsColor ? (color ?? (colorOptions.length === 1 ? colorOptions[0] : null)) : null;

  const activeVariant = resolveVariant(variants, { size: effectiveSize, color: effectiveColor });

  // If switching combinations lands on a variant with less stock than the
  // quantity already dialled in, pull it back down instead of leaving a
  // stale value the stepper's own min/max no longer agrees with. Adjusted
  // during render (React's recommended way to react to a derived value
  // changing) rather than in an effect, which would cause an extra
  // cascading render pass for the same result.
  const [lastVariantId, setLastVariantId] = useState(activeVariant?.id);
  if (activeVariant && activeVariant.id !== lastVariantId) {
    setLastVariantId(activeVariant.id);
    if (activeVariant.stockQuantity > 0 && quantity > activeVariant.stockQuantity) {
      setQuantity(activeVariant.stockQuantity);
    }
  }

  // Colour-tagged photos take over once a colour is selected — same
  // fallback chain as ProductPreviewCard (this colour's tagged shots -> the
  // untagged/generic shots -> everything), adapted from a single photo slot
  // to a full gallery here.
  const images = useMemo(() => {
    const sorted = [...(product?.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    if (!effectiveColor) return sorted;
    const forColor = sorted.filter((img) => img.color === effectiveColor);
    if (forColor.length > 0) return forColor;
    const generic = sorted.filter((img) => !img.color);
    return generic.length > 0 ? generic : sorted;
  }, [product, effectiveColor]);

  // Reset to the first photo whenever the filtered set changes underneath
  // the shopper (a colour swap) so activeImage never points past a shorter
  // list — adjusted during render, same pattern as the stock clamp above.
  const [lastGalleryColor, setLastGalleryColor] = useState(effectiveColor);
  if (effectiveColor !== lastGalleryColor) {
    setLastGalleryColor(effectiveColor);
    setActiveImage(0);
  }

  const mainImage = images[activeImage] ?? images[0];

  if (query.isLoading) {
    return <ProductDetailSkeleton />;
  }

  if (query.isError) {
    if (isApiError(query.error) && query.error.status === 404) {
      return (
        <div className="container section">
          <EmptyState
            icon={Compass}
            title={t('Product not found', 'المنتج غير موجود')}
            body={t("This item doesn't exist or is no longer available.", 'هذا المنتج غير موجود أو لم يعد متاحًا.')}
            action={
              <Link className="btn btn--primary" href={`/${locale}`}>
                {t('Back to store', 'العودة للمتجر')}
              </Link>
            }
          />
        </div>
      );
    }
    return (
      <div className="container section">
        <EmptyState
          tone="alert"
          icon={AlertTriangle}
          title={t("Couldn't load this product", 'تعذّر تحميل هذا المنتج')}
          body={t('Check your connection and try again.', 'تحقق من الاتصال وحاول مرة أخرى.')}
          action={
            <Button variant="primary" onClick={() => query.refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      </div>
    );
  }

  if (!product) return null;

  const favourited = isFavourited(product.id);

  const name = isAr ? product.nameAr : product.nameEn;
  const description = isAr ? product.descriptionAr : product.descriptionEn;
  const collectionName = product.collection
    ? isAr
      ? product.collection.nameAr
      : product.collection.nameEn
    : undefined;
  // No per-collection accent theming here: GET /api/products/:id doesn't
  // select Collection.accentColor onto product.collection (see
  // backend/src/modules/catalog/product.service.ts's productInclude), so
  // there's nothing to feed accentStyle() with. Falls back to the :root
  // accent defaults, same as any other collection-less page.

  // Home / Collection / Category — same shape and "last crumb has no href"
  // convention CategoryProducts already uses. GET /api/products/:id already
  // selects both `category` (full row: nameEn/nameAr/slug) and `collection`
  // (nameEn/nameAr/slug) — no backend change needed for this.
  const categoryName = product.category ? (isAr ? product.category.nameAr : product.category.nameEn) : undefined;
  const crumbs: Crumb[] = [
    { label: t('Home', 'الرئيسية'), href: `/${locale}` },
    ...(product.collection && collectionName
      ? [{ label: collectionName, href: `/${locale}/${product.collection.slug}` }]
      : []),
    ...(product.category && categoryName ? [{ label: categoryName }] : []),
  ];

  // Threshold for the low-stock nudge — picked arbitrarily at 5 (your own
  // example number); not sourced from anywhere else in the schema/backend.
  const LOW_STOCK_THRESHOLD = 5;
  const lowStock =
    Boolean(activeVariant) && activeVariant!.stockQuantity > 0 && activeVariant!.stockQuantity <= LOW_STOCK_THRESHOLD;

  // Same variant-aware precedence as ProductPreviewCard (the validated
  // pattern for this — not diverging from it): once a variant is resolved,
  // its own price/effectivePrice/onSale win over the product's; fall back
  // to the product-level values only before a variant is chosen.
  const priceBase = activeVariant?.price ?? product.price;
  const priceSale = activeVariant
    ? activeVariant.onSale
      ? (activeVariant.effectivePrice ?? null)
      : null
    : product.onSale
      ? product.effectivePrice
      : null;

  // Local current/was numbers purely to size the "Save $X" corner badge —
  // PriceTag redoes this same current/struck calc internally from the same
  // three inputs (price/compareAtPrice/salePrice).
  const base = Number(priceBase);
  const compare = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;
  const current = priceSale != null && priceSale < base ? priceSale : base;
  const wasPrice =
    priceSale != null && priceSale < base ? base : compare != null && compare > current ? compare : null;
  const onSale = wasPrice != null;

  const outOfStock = Boolean(activeVariant) && activeVariant!.stockQuantity <= 0;
  const canAddToCart = Boolean(activeVariant) && !outOfStock;

  return (
    <div className="container section">
      <div style={{ marginBlockEnd: 'var(--space-5)' }}>
        <Breadcrumb ariaLabel={t('Breadcrumb', 'مسار التنقل')} items={crumbs} />
      </div>

      <div className="pdp">
        <div className="pdp__gallery">
          <div className="card pdp__main-media">
            {mainImage ? (
              <button
                type="button"
                className="pdp__zoom-trigger"
                onClick={() => setZoomOpen(true)}
                aria-label={t('View larger image', 'عرض صورة أكبر')}
              >
                <CatalogImage
                  key={mainImage.id}
                  src={mainImage.url}
                  alt={(isAr ? mainImage.altAr : mainImage.altEn) ?? name}
                  fill
                  sizes="(max-width: 860px) 92vw, 46vw"
                  // `priority` was deprecated in Next 16 (silent no-op —
                  // rendered neither `loading="eager"` nor `fetchPriority`, so
                  // this LCP hero image was actually still lazy-loadable).
                  // `preload` is the replacement Next recommends for exactly
                  // this case (the LCP element / above-the-fold hero image) —
                  // it inserts a real <link rel="preload"> in <head>, verified
                  // present. The dev-mode "add loading=eager" console warning
                  // persists regardless of preload/loading/fetchPriority (all
                  // three tried and confirmed rendered correctly) — looks like
                  // a mismatch between this warning's URL-matching and the
                  // custom ImageKit loader's `?tr=...` suffix (next.config.mjs),
                  // not an actual unfixed loading issue.
                  preload
                />
              </button>
            ) : (
              <span className="catalog-image__fallback" aria-hidden />
            )}
            {onSale && (
              <Badge variant="save" className="product-card__badge">
                {isAr
                  ? `توفير ${formatCurrency(wasPrice! - current, locale, 'USD')}`
                  : `Save ${formatCurrency(wasPrice! - current, locale, 'USD')}`}
              </Badge>
            )}
            {mainImage && (
              <span className="pdp__zoom-hint" aria-hidden="true">
                <Icon as={ZoomIn} size={16} />
              </span>
            )}
          </div>

          {images.length > 1 && (
            <div className="pdp__thumbs" role="list">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  role="listitem"
                  className="card pdp__thumb"
                  aria-current={i === activeImage}
                  aria-label={t(`Image ${i + 1} of ${images.length}`, `صورة ${i + 1} من ${images.length}`)}
                  onClick={() => setActiveImage(i)}
                >
                  <CatalogImage src={img.url} alt="" fill sizes="80px" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdp__content">
          {collectionName && product.collection && (
            <Link href={`/${locale}/${product.collection.slug}`} className="eyebrow">
              {collectionName}
            </Link>
          )}
          <h1 className="pdp__title">{name}</h1>
          <PriceTag
            price={priceBase}
            compareAtPrice={product.compareAtPrice}
            salePrice={priceSale}
            locale={locale}
            showBadge={false}
          />

          {lowStock && (
            <Badge variant="low-stock">
              {t(
                `Only ${activeVariant!.stockQuantity} left`,
                `تبقّى ${activeVariant!.stockQuantity} فقط`
              )}
            </Badge>
          )}

          {!product.isActive && isAdmin && (
            <Alert tone="warning" title={t('Hidden from customers', 'مخفي عن الزبائن')}>
              {t('This product is inactive and only visible to staff.', 'هذا المنتج غير مفعّل ومرئي للموظفين فقط.')}
            </Alert>
          )}

          {description && <p className="prose pdp__description">{description}</p>}

          <div className="pdp__options">
            {needsSize && (
              <div className="pdp__option-group">
                <p className="pdp__option-label">{t('Size', 'المقاس')}</p>
                <div className="chip-group">
                  {sizeOptions.map((s) => (
                    <SizeChip
                      key={s}
                      selected={effectiveSize === s}
                      outOfStock={isOptionOutOfStock(variants, 'size', s, effectiveColor)}
                      onClick={() => setSize(s)}
                    >
                      {s}
                    </SizeChip>
                  ))}
                </div>
              </div>
            )}

            {needsColor && (
              <div className="pdp__option-group">
                <p className="pdp__option-label">{t('Colour', 'اللون')}</p>
                {/* swatchColor is a best-effort CSS-keyword guess from free
                    text — see colorNameToCss's doc comment for why it can't
                    be exact and how it degrades. */}
                <div className="swatch-group">
                  {colorOptions.map((c) => (
                    <Swatch
                      key={c}
                      colorName={c}
                      swatchColor={colorNameToCss(c)}
                      selected={effectiveColor === c}
                      outOfStock={isOptionOutOfStock(variants, 'color', c, effectiveSize)}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {outOfStock && (
            <Alert tone="warning">
              {t('This combination is out of stock.', 'هذا المقاس/اللون غير متوفر حاليًا.')}
            </Alert>
          )}

          <div className="pdp__actions">
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              min={1}
              max={activeVariant ? activeVariant.stockQuantity : 1}
              label={t(`Quantity for ${name}`, `الكمية لـ ${name}`)}
              disabled={!canAddToCart}
            />
            <Button
              variant="primary"
              size="lg"
              disabled={!canAddToCart}
              loading={addToCart.isPending}
              onClick={() => {
                if (!activeVariant) return;
                addToCart.mutate(
                  { variantId: activeVariant.id, quantity },
                  {
                    onSuccess: () => {
                      trackAddToCart(productToGaItem(product, activeVariant, quantity));
                      setQuantity(1);
                    },
                  }
                );
              }}
            >
              {t('Add to cart', 'أضف إلى السلة')}
            </Button>
            <button
              type="button"
              className="icon-btn icon-btn--bordered"
              data-active={favourited || undefined}
              onClick={() => toggleFavourite(product.id)}
              disabled={favouritePendingId === product.id}
              aria-pressed={favourited}
              aria-label={
                favourited ? t('Remove from favourites', 'إزالة من المفضّلة') : t('Add to favourites', 'أضف إلى المفضّلة')
              }
            >
              <Icon as={Heart} size={16} fill={favourited ? 'currentColor' : 'none'} />
            </button>
          </div>

          {!activeVariant && (needsSize || needsColor) && (
            <p className="pdp__stock-note">
              {t('Select every option to add this to your cart.', 'اختر كل الخيارات لإضافة المنتج إلى السلة.')}
            </p>
          )}

          {addToCart.isError && (
            <Alert tone="danger">
              {isApiError(addToCart.error) ? addToCart.error.message : t('Something went wrong.', 'حدث خطأ ما.')}
            </Alert>
          )}
        </div>
      </div>

      <RelatedProducts categoryId={product.categoryID} excludeProductId={product.id} locale={locale} />

      {product.category && categoryName && (
        <div className="pdp__discover">
          <Link href={`/${locale}/category/${product.category.slug}`} className="btn btn--outline">
            {t(`Discover more in ${categoryName}`, `اكتشف المزيد في ${categoryName}`)}
          </Link>
        </div>
      )}

      {mainImage && (
        <ImageZoomModal
          open={zoomOpen}
          onClose={() => setZoomOpen(false)}
          src={mainImage.url}
          alt={(isAr ? mainImage.altAr : mainImage.altEn) ?? name}
          closeLabel={t('Close', 'إغلاق')}
        />
      )}
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="container section pdp" aria-busy="true" aria-live="polite">
      <div className="pdp__gallery">
        <Skeleton variant="media" />
      </div>
      <div className="pdp__content">
        <Skeleton variant="title" style={{ width: '70%' }} />
        <Skeleton variant="text" style={{ width: '30%' }} />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  );
}
