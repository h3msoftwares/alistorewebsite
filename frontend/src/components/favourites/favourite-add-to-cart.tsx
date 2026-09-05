'use client';

import { Button } from '@/components/ui';
import { useAddToCart } from '@/hooks/use-cart';
import { isApiError } from '@/lib/api';

/**
 * Per-favourite "Add to cart" control — its own mutation instance so each
 * row's pending / added / error state is isolated. Shared by the favourites
 * drawer and the favourites page. `variantId` is the product's first in-stock
 * variant (resolved by the caller); `null` means nothing is in stock.
 */
export function FavouriteAddToCart({
  variantId,
  locale,
  size = 'sm',
  block = false,
}: {
  variantId: string | null;
  locale: string;
  size?: 'sm' | 'md';
  block?: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const add = useAddToCart();
  const inStock = variantId != null;

  const label = !inStock
    ? t('Out of stock', 'غير متوفر')
    : add.isSuccess
      ? t('Added ✓', 'أُضيف ✓')
      : t('Add to cart', 'أضف إلى السلة');

  return (
    <>
      <Button
        variant="outline"
        size={size}
        block={block}
        disabled={!inStock || add.isPending}
        loading={add.isPending}
        onClick={() => variantId && add.mutate({ variantId })}
      >
        {label}
      </Button>
      {add.isError && (
        <span style={{ color: 'var(--color-danger)', fontSize: 'var(--fs-sm)' }}>
          {isApiError(add.error) && add.error.code === 'OUT_OF_STOCK'
            ? t('Not enough stock.', 'الكمية غير كافية.')
            : t("Couldn't add to cart. Try again.", 'تعذّرت الإضافة إلى السلة. حاول مرة أخرى.')}
        </span>
      )}
    </>
  );
}
