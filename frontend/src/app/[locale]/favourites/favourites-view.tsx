'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Heart, HeartCrack } from 'lucide-react';
import {
  Button,
  Choice,
  EmptyState,
  ProductCard,
  ProductGridSkeleton,
  type ProductCardData,
} from '@/components/ui';
import { FavouriteAddToCart } from '@/components/favourites/favourite-add-to-cart';
import { useFavourites } from '@/hooks/use-favourites';
import { useFavouritesCart } from '@/hooks/use-favourites-cart';
import type { Product } from '@/lib/types';

type Locale = 'en' | 'ar';

// `false` on the server and on the hydration render, `true` afterwards — lets
// us hold the skeleton until the client can actually resolve auth / guest
// state, without a hydration mismatch or a setState-in-effect.
const subscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

// Product (API shape) → the shape <ProductCard> wants. Favourites are
// product-level, so there's no variant to thread through — just surface the
// distinct sizes for the card's inline availability line.
function toCardData(p: Product): ProductCardData {
  return {
    id: p.id,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    salePrice: p.onSale ? p.effectivePrice : null,
    images: p.images,
    sizes: [...new Set(p.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))],
    isRestocked: p.isRestocked,
  };
}

export function FavouritesView({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { favourites, count, isPending, isError, refetch, toggleFavourite, pendingId } =
    useFavourites();
  const sel = useFavouritesCart(favourites);

  // Favourites are per-user and only knowable on the client (auth state, guest
  // localStorage) — like the cart page, there's nothing meaningful to SSR.
  const hydrated = useHydrated();

  const heading = <h1>{t('Favourites', 'المفضّلة')}</h1>;

  if (!hydrated || isPending) {
    return (
      <div className="container section">
        {heading}
        <div style={{ marginBlockStart: 'var(--space-5)' }}>
          <ProductGridSkeleton count={4} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container section">
        {heading}
        <EmptyState
          tone="alert"
          icon={HeartCrack}
          title={t("Couldn't load your favourites", 'تعذّر تحميل المفضّلة')}
          body={t('Check your connection and try again.', 'تحقّق من اتصالك وحاول مرة أخرى.')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="container section">
        {heading}
        <EmptyState
          icon={Heart}
          title={t('No favourites yet', 'لا توجد مفضّلات بعد')}
          body={t('Save products you love and find them here.', 'احفظ المنتجات التي تعجبك وستجدها هنا.')}
          action={
            <Link className="btn btn--primary" href={`/${locale}`}>
              {t('Continue shopping', 'متابعة التسوق')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container section">
      {heading}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          marginBlockStart: 'var(--space-4)',
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
        {sel.summary && (
          <span aria-live="polite" style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-muted)' }}>
            {sel.summary.failed === 0
              ? t(`${sel.summary.added} added to cart.`, `تمت إضافة ${sel.summary.added} إلى السلة.`)
              : t(
                  `${sel.summary.added} added · ${sel.summary.failed} unavailable.`,
                  `${sel.summary.added} مضافة · ${sel.summary.failed} غير متوفرة.`,
                )}
          </span>
        )}
      </div>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 'var(--space-4) 0 0',
          display: 'grid',
          gap: 'var(--space-5)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}
      >
        {favourites.map((p) => {
          const variantId = sel.purchasable.get(p.id) ?? null;
          const name = isAr ? p.nameAr : p.nameEn;
          return (
            <li key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Choice
                label={<span className="visually-hidden">{t(`Select ${name}`, `تحديد ${name}`)}</span>}
                checked={sel.isSelected(p.id)}
                disabled={variantId == null}
                onChange={() => sel.toggleOne(p.id)}
              />
              <ProductCard product={toCardData(p)} locale={locale} />
              <FavouriteAddToCart variantId={variantId} locale={locale} block />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleFavourite(p.id)}
                loading={pendingId === p.id}
              >
                {t('Remove', 'إزالة')}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
