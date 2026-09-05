'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart, HeartCrack } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button, Choice, EmptyState, PriceTag, Skeleton } from '@/components/ui';
import { FavouriteAddToCart } from '@/components/favourites/favourite-add-to-cart';
import { useFavourites } from '@/hooks/use-favourites';
import { useFavouritesCart } from '@/hooks/use-favourites-cart';
import type { Product } from '@/lib/types';

/**
 * Mini-favourites, opened from the header heart icon — the favourites twin of
 * <CartDrawer>. Reads through the same useFavourites() hook as the /favourites
 * page (one source of truth, guest slice or backend), and shares its
 * select / move-to-cart logic with that page via useFavouritesCart().
 *
 * Favourites are product-level, so "Add to cart" adds the product's first
 * in-stock variant (arbitrary size/colour for a multi-variant product); the
 * shopper can change size/colour afterwards on the /cart page. A product with
 * no variant in stock is shown but its add controls are disabled.
 */
export function FavouritesDrawer({
  open,
  onClose,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { favourites, count, isPending, isError, refetch, toggleFavourite, pendingId } =
    useFavourites();
  const sel = useFavouritesCart(favourites);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="end"
      title={t('Favourites', 'المفضّلة')}
      closeLabel={t('Close favourites', 'إغلاق المفضّلة')}
    >
      {isPending ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <Skeleton variant="media" width="56px" height="70px" />
              <Skeleton variant="text" width="60%" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          tone="alert"
          icon={HeartCrack}
          title={t("Couldn't load your favourites", 'تعذّر تحميل المفضّلة')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : count === 0 ? (
        <EmptyState
          icon={Heart}
          title={t('No favourites yet', 'لا توجد مفضّلات بعد')}
          body={t('Save products you love and find them here.', 'احفظ المنتجات التي تعجبك وستجدها هنا.')}
          action={
            <Link className="btn btn--primary" href={`/${locale}`} onClick={onClose}>
              {t('Continue shopping', 'متابعة التسوق')}
            </Link>
          }
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              paddingBlockEnd: 'var(--space-3)',
              borderBlockEnd: '1px solid var(--color-border)',
            }}
          >
            <Choice
              label={t('Select all', 'تحديد الكل')}
              checked={sel.allSelected}
              disabled={sel.addableIds.length === 0}
              onChange={sel.toggleAll}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={sel.addSelectedToCart}
              loading={sel.isAdding}
              disabled={sel.selectedCount === 0 || sel.isAdding}
            >
              {sel.selectedCount > 0
                ? t(`Add ${sel.selectedCount} to cart`, `أضف ${sel.selectedCount} إلى السلة`)
                : t('Add selected to cart', 'أضف المحدد إلى السلة')}
            </Button>
          </div>

          {sel.summary && (
            <p aria-live="polite" style={{ marginBlock: 'var(--space-3)', fontSize: 'var(--fs-sm)' }}>
              {sel.summary.failed === 0
                ? t(`${sel.summary.added} added to cart.`, `تمت إضافة ${sel.summary.added} إلى السلة.`)
                : t(
                    `${sel.summary.added} added · ${sel.summary.failed} unavailable.`,
                    `${sel.summary.added} مضافة · ${sel.summary.failed} غير متوفرة.`,
                  )}
            </p>
          )}

          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0' }}>
            {favourites.map((product) => (
              <li
                key={product.id}
                style={{
                  paddingBlockEnd: 'var(--space-4)',
                  borderBlockEnd: '1px solid var(--color-border)',
                }}
              >
                <FavouriteDrawerRow
                  product={product}
                  locale={locale}
                  variantId={sel.purchasable.get(product.id) ?? null}
                  selected={sel.isSelected(product.id)}
                  onToggleSelect={() => sel.toggleOne(product.id)}
                  onRemove={() => toggleFavourite(product.id)}
                  removing={pendingId === product.id}
                  onNavigate={onClose}
                />
              </li>
            ))}
          </ul>

          <div style={{ marginBlockStart: 'var(--space-5)' }}>
            <Link
              className="btn btn--outline btn--block"
              href={`/${locale}/favourites`}
              onClick={onClose}
            >
              {t('View all favourites', 'عرض كل المفضّلة')}
            </Link>
          </div>
        </>
      )}
    </Drawer>
  );
}

function FavouriteDrawerRow({
  product,
  locale,
  variantId,
  selected,
  onToggleSelect,
  onRemove,
  removing,
  onNavigate,
}: {
  product: Product;
  locale: string;
  /** First in-stock variant id, or `null` when nothing is in stock. */
  variantId: string | null;
  selected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  removing: boolean;
  onNavigate: () => void;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const inStock = variantId != null;
  const name = isAr ? product.nameAr : product.nameEn;
  const image = product.images.find((img) => !img.color) ?? product.images[0];

  return (
    <div aria-busy={removing || undefined} style={{ display: 'flex', gap: 'var(--space-3)' }}>
      <Choice
        label={<span className="visually-hidden">{t(`Select ${name}`, `تحديد ${name}`)}</span>}
        checked={selected}
        disabled={!inStock}
        onChange={onToggleSelect}
      />

      {image ? (
        <Image
          src={image.url}
          alt={(isAr ? image.altAr : image.altEn) ?? name}
          width={56}
          height={70}
          style={{ objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 56,
            height: 70,
            flexShrink: 0,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-sunken)',
          }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0, flex: 1 }}>
        <Link
          href={`/${locale}/product/${product.id}`}
          onClick={onNavigate}
          style={{ fontWeight: 'var(--fw-medium)' }}
        >
          {name}
        </Link>
        <PriceTag
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          salePrice={product.onSale ? product.effectivePrice : null}
          locale={locale as 'en' | 'ar'}
          showBadge={false}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            marginBlockStart: 'var(--space-1)',
          }}
        >
          <FavouriteAddToCart variantId={variantId} locale={locale} />
          <Button variant="ghost" size="sm" onClick={onRemove} loading={removing} disabled={removing}>
            {t('Remove', 'إزالة')}
          </Button>
        </div>
      </div>
    </div>
  );
}
