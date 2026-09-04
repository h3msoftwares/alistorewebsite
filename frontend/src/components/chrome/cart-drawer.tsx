'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Button, EmptyState, PriceTag, QuantityStepper, Skeleton } from '@/components/ui';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '@/hooks/use-cart';
import type { CartItem } from '@/lib/types';

/**
 * Mini-cart, opened from the header cart icon. Reads/writes through the same
 * useCart()/useUpdateCartItem()/useRemoveCartItem() hooks as the full /cart
 * page — same React Query cache entry (queryKeys.cart.root()), so the two
 * surfaces can never disagree, and a change made here is what /cart shows if
 * the shopper navigates there next.
 *
 * Always rendered by Topbar (visibility toggled via `open`, same as
 * SearchOverlay and the menu Drawer) — which means its useCart() call runs on
 * every page, not just /cart. That's deliberate: it's what keeps the header
 * badge correct app-wide instead of only after visiting the cart page.
 *
 * Size/color is shown as text only, not editable here — that control lives on
 * the full cart page; the drawer stays a quick glance/adjust-quantity surface.
 */
export function CartDrawer({
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
  const { data, isPending, isError, refetch } = useCart();

  const money = (n: number) =>
    new Intl.NumberFormat(isAr ? 'ar-EG' : 'en-US', { style: 'currency', currency: 'USD' }).format(n);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="end"
      title={t('Cart', 'سلة التسوق')}
      closeLabel={t('Close cart', 'إغلاق السلة')}
    >
      {isPending ? (
        <div className="stack">
          {[0, 1].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <Skeleton variant="media" width="56px" height="70px" />
              <Skeleton variant="text" width="60%" />
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        <EmptyState
          tone="alert"
          icon={ShoppingBag}
          title={t("Couldn't load your cart", 'تعذّر تحميل سلة التسوق')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={t('Your cart is empty', 'سلة التسوق فارغة')}
          body={t('Browse a collection to add something.', 'تصفّح إحدى المجموعات وأضف بعض القطع.')}
          action={
            <Link className="btn btn--primary" href={`/${locale}`} onClick={onClose}>
              {t('Continue shopping', 'متابعة التسوق')}
            </Link>
          }
        />
      ) : (
        <>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.items.map((item) => (
              <li
                key={item.id}
                style={{
                  paddingBlockEnd: 'var(--space-4)',
                  borderBlockEnd: '1px solid var(--color-border)',
                }}
              >
                <CartDrawerRow item={item} locale={locale} onNavigate={onClose} />
              </li>
            ))}
          </ul>

          <div
            className="stack"
            style={{
              marginBlockStart: 'var(--space-5)',
              paddingBlockStart: 'var(--space-4)',
            }}
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
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(data.subtotal)}</span>
            </div>
            <Link className="btn btn--primary btn--block" href={`/${locale}/checkout`} onClick={onClose}>
              {t('Checkout', 'الدفع')}
            </Link>
            <Link className="btn btn--outline btn--block" href={`/${locale}/cart`} onClick={onClose}>
              {t('View Cart', 'عرض السلة')}
            </Link>
          </div>
        </>
      )}
    </Drawer>
  );
}

function CartDrawerRow({
  item,
  locale,
  onNavigate,
}: {
  item: CartItem;
  locale: string;
  onNavigate: () => void;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const update = useUpdateCartItem();
  const remove = useRemoveCartItem();
  const busy = update.isPending || remove.isPending;

  const { product } = item.variant;
  const name = isAr ? product.nameAr : product.nameEn;
  const image = product.images[0];
  const variantBits = [item.variant.size, item.variant.color].filter(Boolean).join(' · ');

  return (
    <div aria-busy={busy || undefined} style={{ display: 'flex', gap: 'var(--space-3)' }}>
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
        {variantBits && <span style={{ color: 'var(--color-text-muted)' }}>{variantBits}</span>}
        <PriceTag
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          locale={locale as 'en' | 'ar'}
          showBadge={false}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            marginBlockStart: 'var(--space-1)',
          }}
        >
          <QuantityStepper
            value={item.quantity}
            onChange={(next) => update.mutate({ itemId: item.id, quantity: next })}
            min={1}
            max={Math.max(1, item.variant.stockQuantity)}
            disabled={busy}
            label={t(`Quantity for ${name}`, `الكمية لـ ${name}`)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => remove.mutate({ itemId: item.id })}
            loading={remove.isPending}
            disabled={busy}
          >
            {t('Remove', 'إزالة')}
          </Button>
        </div>
      </div>
    </div>
  );
}
