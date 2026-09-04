'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, Compass } from 'lucide-react';
import { Alert, Badge, Button, EmptyState, PriceTag, QuantityStepper, Skeleton, SizeChip, Swatch } from '@/components/ui';
import { useProduct } from '@/hooks/use-catalog';
import { useAddToCart } from '@/hooks/use-cart';
import { useAuth } from '@/hooks/use-auth';
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

  const images = useMemo(
    () => [...(product?.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [product]
  );
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

  // Same sale-price precedence as ProductCard/PriceTag: an active
  // saleType/saleValue discount (product.effectivePrice, when onSale) beats
  // compareAtPrice when both are present. Kept local to this component
  // (rather than only relying on PriceTag's own copy of this math) because
  // the "Save $X" corner badge needs the same current/was numbers.
  const price = Number(product.price);
  const sale = product.onSale ? product.effectivePrice : null;
  const compare = product.compareAtPrice != null ? Number(product.compareAtPrice) : null;

  const current = sale != null && sale < price ? sale : price;
  const wasPrice =
    sale != null && sale < price ? price : compare != null && compare > current ? compare : null;
  const onSale = wasPrice != null;

  const outOfStock = Boolean(activeVariant) && activeVariant!.stockQuantity <= 0;
  const canAddToCart = Boolean(activeVariant) && !outOfStock;

  return (
    <div className="container section pdp">
      <div className="pdp__gallery">
        <div className="card pdp__main-media">
          {mainImage ? (
            <Image
              key={mainImage.id}
              src={mainImage.url}
              alt={(isAr ? mainImage.altAr : mainImage.altEn) ?? name}
              fill
              sizes="(max-width: 860px) 92vw, 46vw"
              priority
            />
          ) : (
            <span className="category-card__media-placeholder" aria-hidden />
          )}
          {onSale && (
            <Badge variant="save" className="product-card__badge">
              {isAr
                ? `توفير ${formatCurrency(wasPrice! - current, locale, 'USD')}`
                : `Save ${formatCurrency(wasPrice! - current, locale, 'USD')}`}
            </Badge>
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
                <Image src={img.url} alt="" fill sizes="80px" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pdp__content">
        {collectionName && <p className="eyebrow">{collectionName}</p>}
        <h1 className="pdp__title">{name}</h1>
        <PriceTag
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          salePrice={product.onSale ? product.effectivePrice : null}
          locale={locale}
          showBadge={false}
        />

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
                { onSuccess: () => setQuantity(1) }
              );
            }}
          >
            {t('Add to cart', 'أضف إلى السلة')}
          </Button>
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
