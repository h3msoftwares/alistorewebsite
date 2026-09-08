'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { Button, DataTable, EmptyState, PriceTag, QuantityStepper, Skeleton } from '@/components/ui';
import { CartVariantPicker } from '@/components/cart/cart-variant-picker';
import { useCart, useClearCart, useRemoveCartItem, useUpdateCartItem } from '@/hooks/use-cart';
import { useSettings } from '@/hooks/use-settings';
import { cartItemToGaItem, trackRemoveFromCart } from '@/lib/analytics/ga';
import type { CartItem } from '@/lib/types';

type Locale = 'en' | 'ar';

const money = (n: number, locale: Locale) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n);

export function CartView({ locale }: { locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data, isPending, isError, refetch } = useCart();
  const clearCart = useClearCart();
  const { data: settings } = useSettings();
  const freeOver =
    settings?.deliveryFeeEnabled && settings.freeDeliveryThreshold != null
      ? Number(settings.freeDeliveryThreshold)
      : null;

  const heading = <h1>{t('Cart', 'سلة التسوق')}</h1>;

  if (isPending) {
    return (
      <div className="container section">
        {heading}
        <div className="stack" style={{ marginBlockStart: 'var(--space-5)' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
              <Skeleton variant="media" width="64px" height="80px" />
              <Skeleton variant="text" width="45%" />
              <Skeleton variant="text" width="12%" style={{ marginInlineStart: 'auto' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container section">
        {heading}
        <EmptyState
          tone="alert"
          icon={ShoppingBag}
          title={t("Couldn't load your cart", 'تعذّر تحميل سلة التسوق')}
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

  if (data.items.length === 0) {
    return (
      <div className="container section">
        {heading}
        <EmptyState
          icon={ShoppingBag}
          title={t('Your cart is empty', 'سلة التسوق فارغة')}
          body={t('Browse a collection to add something.', 'تصفّح إحدى المجموعات وأضف بعض القطع.')}
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

      {/* No forced minWidth here — .table--responsive's own <=640px breakpoint
          collapses each row to a stacked card, and a fixed minWidth would
          override the table wider than the viewport and defeat that (found
          while verifying the new size/color picker at 375px). */}
      <DataTable responsive style={{ marginBlockStart: 'var(--space-5)' }}>
        <thead>
          <tr>
            <th>{t('Product', 'المنتج')}</th>
            <th>{t('Quantity', 'الكمية')}</th>
            <th className="is-numeric">{t('Total', 'المجموع')}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <CartRow key={item.id} item={item} locale={locale} />
          ))}
        </tbody>
      </DataTable>

      <div
        className="stack"
        style={{ marginBlockStart: 'var(--space-6)', marginInlineStart: 'auto', maxWidth: '22rem' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            fontWeight: 'var(--fw-medium)',
          }}
        >
          <span>{t('Subtotal', 'المجموع الفرعي')}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(data.subtotal, locale)}</span>
        </div>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          {t('Delivery is calculated at checkout.', 'تُحتسب رسوم التوصيل عند الدفع.')}
          {freeOver != null && (
            <>
              {' '}
              {t(
                `Free delivery on orders over ${money(freeOver, locale)}.`,
                `توصيل مجاني للطلبات فوق ${money(freeOver, locale)}.`
              )}
            </>
          )}
        </p>
        <Link className="btn btn--primary btn--block btn--lg" href={`/${locale}/checkout`}>
          {t('Proceed to checkout', 'متابعة الدفع')}
        </Link>
        <Button
          variant="ghost"
          block
          onClick={() => clearCart.mutate()}
          loading={clearCart.isPending}
        >
          {t('Clear cart', 'إفراغ السلة')}
        </Button>
      </div>
    </div>
  );
}

function CartRow({ item, locale }: { item: CartItem; locale: Locale }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const quantityUpdate = useUpdateCartItem();
  const remove = useRemoveCartItem();

  const { product } = item.variant;
  const name = isAr ? product.nameAr : product.nameEn;
  const image = product.images[0];
  // The API's effective unit price (variant override → product sale → catalog
  // discount); falls back to the base price for older payloads.
  const unitPrice = item.effectivePrice ?? Number(item.variant.price ?? product.price);
  const wasReduced = unitPrice < Number(product.price);
  const lineTotal = unitPrice * item.quantity;
  const busy = quantityUpdate.isPending || remove.isPending;

  return (
    <tr aria-busy={busy || undefined} data-loading={busy || undefined}>
      <td data-label={t('Product', 'المنتج')}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
          {image ? (
            <Image
              src={image.url}
              alt={(isAr ? image.altAr : image.altEn) ?? name}
              width={64}
              height={80}
              style={{ objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
            />
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: 64,
                height: 80,
                flexShrink: 0,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-sunken)',
              }}
            />
          )}
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              minWidth: 0,
              flex: 1,
            }}
          >
            <Link href={`/${locale}/product/${product.id}`}>{name}</Link>

            <CartVariantPicker item={item} locale={locale} disabled={busy} />

            <PriceTag
              price={unitPrice}
              compareAtPrice={wasReduced ? product.price : product.compareAtPrice}
              locale={locale}
              showBadge={false}
            />
          </span>
        </div>
      </td>

      <td data-label={t('Quantity', 'الكمية')}>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <QuantityStepper
            value={item.quantity}
            onChange={(next) => quantityUpdate.mutate({ itemId: item.id, quantity: next })}
            min={1}
            max={Math.max(1, item.variant.stockQuantity)}
            disabled={busy}
            label={t(`Quantity for ${name}`, `الكمية لـ ${name}`)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              remove.mutate(
                { itemId: item.id },
                { onSuccess: () => trackRemoveFromCart(cartItemToGaItem(item)) }
              )
            }
            loading={remove.isPending}
            disabled={busy}
          >
            {t('Remove', 'إزالة')}
          </Button>
        </div>
      </td>

      <td className="is-numeric" data-label={t('Total', 'المجموع')}>
        {money(lineTotal, locale)}
      </td>
    </tr>
  );
}
