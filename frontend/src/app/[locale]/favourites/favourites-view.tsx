'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Heart, HeartCrack } from 'lucide-react';
import {
  Button,
  EmptyState,
  ProductCard,
  ProductGridSkeleton,
  type ProductCardData,
} from '@/components/ui';
import { useFavourites } from '@/hooks/use-favourites';
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
  };
}

export function FavouritesView({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { favourites, count, isPending, isError, refetch, toggleFavourite, pendingId } =
    useFavourites();

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
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 'var(--space-5) 0 0',
          display: 'grid',
          gap: 'var(--space-5)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        }}
      >
        {favourites.map((p) => (
          <li key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <ProductCard product={toCardData(p)} locale={locale} />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleFavourite(p.id)}
              loading={pendingId === p.id}
            >
              {t('Remove', 'إزالة')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
