'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, ShoppingBag, X } from 'lucide-react';
import { CatalogImage, Icon, PriceTag, SizeChip, Swatch } from '@/components/ui';
import { useCollections, useProducts, useTopLevelCategories } from '@/hooks/use-catalog';
import { useAddToCart } from '@/hooks/use-cart';
import { useFavourites } from '@/hooks/use-favourites';
import { useAppSelector } from '@/store/hooks';
import { selectCartCount } from '@/store/slices/cartSlice';
import { selectFavouritesCount } from '@/store/slices/favouritesSlice';
import {
  colorLabel,
  colorNameToCss,
  firstPurchasableVariant,
  getColorOptions,
  getSizeOptions,
  hasColorAxis,
  hasSizeAxis,
  isOptionOutOfStock,
  resolveVariant,
} from '@/lib/product-variants';
import type { Category, Collection, Product, ProductListQuery, UUID } from '@/lib/types';

type ReelsFilter = { type: 'category' | 'collection'; id: UUID } | null;

/**
 * If the shopper opened Discover while looking at a category or collection
 * page, pre-select that same filter — `'pending'` when the categories/
 * collections list needed to resolve it hasn't loaded yet, so the caller
 * knows to retry once it has instead of settling for "no match". */
function matchRouteFilter(
  pathname: string,
  locale: string,
  categories: Category[] | undefined,
  collections: Collection[] | undefined
): { status: 'match'; filter: ReelsFilter } | { status: 'none' } | { status: 'pending' } {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== locale) return { status: 'none' };

  if (segments[1] === 'category' && segments[2]) {
    if (!categories) return { status: 'pending' };
    const match = categories.find((c) => c.slug === segments[2]);
    return match ? { status: 'match', filter: { type: 'category', id: match.id } } : { status: 'none' };
  }

  // Collections live at the bare `/[locale]/[collection]` route — only
  // treat a single trailing segment as one if it actually matches a known
  // collection slug (it's just as likely /cart, /login, /favourites, ...).
  if (segments.length === 2 && segments[1]) {
    if (!collections) return { status: 'pending' };
    const match = collections.find((c) => c.slug === segments[1]);
    return match ? { status: 'match', filter: { type: 'collection', id: match.id } } : { status: 'none' };
  }

  return { status: 'none' };
}

/**
 * Phone-only "Discover" feed opened from the bottom nav — one product per
 * full-screen slide, swipe up/down (CSS scroll-snap, no touch-handler JS
 * needed) to move to the next one. Favourite + add-to-cart sit in a side
 * rail per slide (each slide owns its own variant selection), same
 * hooks/variant-resolution the PDP and product cards already use.
 */
export function ReelsModal({
  open,
  onClose,
  onOpenCart,
  onOpenFavourites,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  /** Opens the existing CartDrawer/FavouritesDrawer over this modal (same
   *  drawers the topbar uses — the caller owns their open state). */
  onOpenCart: () => void;
  onOpenFavourites: () => void;
  locale: string;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const cartCount = useAppSelector(selectCartCount);
  const favCount = useAppSelector(selectFavouritesCount);

  const [filter, setFilter] = useState<ReelsFilter>(null);
  const { data: categories } = useTopLevelCategories();
  const { data: collections } = useCollections();
  const pathname = usePathname() ?? '';

  // Auto-select the category/collection the shopper was viewing when they
  // opened Discover — re-tried (via the categories/collections deps) if the
  // lists hadn't loaded yet on the first pass, but only once per open+route
  // so it never stomps a filter the shopper picks by hand while it's open.
  const appliedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      appliedForRef.current = null;
      return;
    }
    if (appliedForRef.current === pathname) return;
    const result = matchRouteFilter(pathname, locale, categories, collections);
    if (result.status === 'pending') return;
    if (result.status === 'match') setFilter(result.filter);
    appliedForRef.current = pathname;
  }, [open, pathname, locale, categories, collections]);

  const query: ProductListQuery = { sort: 'newest', pageSize: 24 };
  if (filter?.type === 'category') query.categoryId = filter.id;
  else if (filter?.type === 'collection') query.collectionId = filter.id;

  const { data, isPending } = useProducts(query, { enabled: open, keepPreviousData: false });
  const products = data?.items ?? [];

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="reels-modal" role="dialog" aria-modal="true" aria-label={t('Discover', 'اكتشف')}>
      <div className="reels-modal__top">
        <div className="reels-modal__top-actions">
          <button
            type="button"
            className="reels-modal__top-action"
            onClick={onOpenFavourites}
            aria-label={t('Favourites', 'المفضّلة')}
          >
            <Icon as={Heart} size={20} />
            {favCount > 0 && (
              <span className="icon-btn__badge" aria-hidden="true">
                {favCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="reels-modal__top-action"
            onClick={onOpenCart}
            aria-label={t('Cart', 'سلة التسوق')}
          >
            <Icon as={ShoppingBag} size={20} />
            {cartCount > 0 && (
              <span className="icon-btn__badge" aria-hidden="true">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          className="reels-modal__close"
          onClick={onClose}
          aria-label={t('Close', 'إغلاق')}
        >
          <Icon as={X} />
        </button>
      </div>

      <div className="reels-modal__filters" role="tablist" aria-label={t('Filter', 'تصفية')}>
        <button
          type="button"
          className="reels-modal__filter-chip"
          data-active={filter === null || undefined}
          onClick={() => setFilter(null)}
        >
          {t('All', 'الكل')}
        </button>
        {(categories ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            className="reels-modal__filter-chip"
            data-active={(filter?.type === 'category' && filter.id === c.id) || undefined}
            onClick={() => setFilter({ type: 'category', id: c.id })}
          >
            {isAr ? c.nameAr : c.nameEn}
          </button>
        ))}
        {(collections ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            className="reels-modal__filter-chip"
            data-active={(filter?.type === 'collection' && filter.id === c.id) || undefined}
            onClick={() => setFilter({ type: 'collection', id: c.id })}
          >
            {isAr ? c.nameAr : c.nameEn}
          </button>
        ))}
      </div>

      <div className="reels-modal__feed">
        {products.map((product) => (
          <ReelSlide key={product.id} product={product} locale={locale} />
        ))}
        {!isPending && products.length === 0 && (
          <div className="reels-slide reels-slide--empty">
            <p>{t('No products yet', 'لا توجد منتجات بعد')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReelSlide({ product, locale }: { product: Product; locale: string }) {
  const isAr = locale === 'ar';
  const langTag: 'en' | 'ar' = isAr ? 'ar' : 'en';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const name = isAr ? product.nameAr : product.nameEn;
  const variants = product.variants;
  const needsSize = hasSizeAxis(variants);
  const needsColor = hasColorAxis(variants);
  const sizeOptions = needsSize ? getSizeOptions(variants) : [];
  const colorOptions = needsColor ? getColorOptions(variants) : [];

  const [size, setSize] = useState<string | null>(sizeOptions[0] ?? null);
  const [color, setColor] = useState<string | null>(colorOptions[0] ?? null);

  const effectiveSize = needsSize ? size : null;
  const effectiveColor = needsColor ? color : null;
  const selectedVariant =
    resolveVariant(variants, { size: effectiveSize, color: effectiveColor }) ??
    firstPurchasableVariant(variants);
  const outOfStock = !selectedVariant || selectedVariant.stockQuantity <= 0;

  const image =
    product.images.find((img) => (effectiveColor ? img.color === effectiveColor : !img.color)) ??
    product.images[0];

  const { isFavourited, toggleFavourite, pendingId: favouritePendingId } = useFavourites();
  const favourited = isFavourited(product.id);
  const addToCart = useAddToCart();

  const href = `/${locale}/product/${product.id}`;

  return (
    <section className="reels-slide">
      {image && (
        <CatalogImage
          src={image.url}
          alt={(isAr ? image.altAr : image.altEn) ?? name}
          fill
          sizes="100vw"
          className="reels-slide__media"
        />
      )}
      <div className="reels-slide__scrim" aria-hidden="true" />

      <div className="reels-slide__rail">
        <button
          type="button"
          className="reels-slide__action"
          data-active={favourited || undefined}
          disabled={favouritePendingId === product.id}
          onClick={() => toggleFavourite(product.id)}
          aria-pressed={favourited}
          aria-label={
            favourited ? t('Remove from favourites', 'إزالة من المفضّلة') : t('Add to favourites', 'أضف إلى المفضّلة')
          }
        >
          <Icon as={Heart} size={24} fill={favourited ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          className="reels-slide__action"
          disabled={outOfStock || addToCart.isPending}
          data-loading={addToCart.isPending || undefined}
          onClick={() => selectedVariant && addToCart.mutate({ variantId: selectedVariant.id, quantity: 1 })}
          aria-label={outOfStock ? t('Out of stock', 'غير متوفر') : t('Add to cart', 'أضف إلى السلة')}
        >
          <Icon as={ShoppingBag} size={24} />
        </button>
      </div>

      <div className="reels-slide__info">
        <Link href={href} className="reels-slide__name">
          {name}
        </Link>
        <PriceTag
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          salePrice={product.effectivePrice}
          locale={langTag}
          showBadge={false}
        />

        {needsColor && (
          <div className="swatch-group reels-slide__swatches">
            {colorOptions.map((c) => (
              <Swatch
                key={c}
                colorName={colorLabel(c, langTag)}
                locale={langTag}
                imageUrl={product.images.find((img) => img.color === c)?.url}
                swatchColor={colorNameToCss(c)}
                selected={effectiveColor === c}
                outOfStock={isOptionOutOfStock(variants, 'color', c, effectiveSize)}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        )}
        {needsSize && (
          <div className="chip-group reels-slide__chips">
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
        )}
      </div>
    </section>
  );
}
