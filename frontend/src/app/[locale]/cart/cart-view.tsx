'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  PriceTag,
  QuantityStepper,
  Select,
  Skeleton,
} from '@/components/ui';
import {
  useCart,
  useClearCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from '@/hooks/use-cart';
import { isApiError } from '@/lib/api';
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
  const variantUpdate = useUpdateCartItem();
  const remove = useRemoveCartItem();

  const { product } = item.variant;
  const name = isAr ? product.nameAr : product.nameEn;
  const image = product.images[0];
  const variantBits = [item.variant.size, item.variant.color].filter(Boolean).join(' · ');
  const lineTotal = Number(product.price) * item.quantity;
  const busy = quantityUpdate.isPending || variantUpdate.isPending || remove.isPending;

  // ---- size/color picker ---------------------------------------------
  const siblingVariants = product.variants;
  const sizes = useMemo(
    () => Array.from(new Set(siblingVariants.map((v) => v.size).filter((s): s is string => Boolean(s)))),
    [siblingVariants]
  );
  const colors = useMemo(
    () => Array.from(new Set(siblingVariants.map((v) => v.color).filter((s): s is string => Boolean(s)))),
    [siblingVariants]
  );
  const canChangeSize = sizes.length > 1;
  const canChangeColor = colors.length > 1;
  const canChangeVariant = canChangeSize || canChangeColor;

  const [editingVariant, setEditingVariant] = useState(false);
  const [selectedSize, setSelectedSize] = useState(item.variant.size ?? '');
  const [selectedColor, setSelectedColor] = useState(item.variant.color ?? '');
  const [noMatchError, setNoMatchError] = useState(false);

  // Resync the local picker whenever the server-confirmed variant changes
  // (e.g. after a successful switch) — the row keeps the same React key
  // (same cart-item id) across a size/color change, so state wouldn't
  // otherwise refresh on its own. Adjusted during render (React's documented
  // pattern for this), not in an effect, so it doesn't cost an extra paint.
  const [syncedVariantId, setSyncedVariantId] = useState(item.variant.id);
  if (item.variant.id !== syncedVariantId) {
    setSyncedVariantId(item.variant.id);
    setSelectedSize(item.variant.size ?? '');
    setSelectedColor(item.variant.color ?? '');
    setNoMatchError(false);
  }

  const applyVariantChange = (nextSize: string, nextColor: string) => {
    const match = siblingVariants.find(
      (v) => (v.size ?? '') === nextSize && (v.color ?? '') === nextColor
    );
    if (!match) {
      setNoMatchError(true);
      return;
    }
    setNoMatchError(false);
    if (match.id === item.variant.id) return; // selecting the current combo again — no-op
    // Stays open after a successful switch (rather than auto-closing) so
    // picking a new size and then a new color doesn't need two "Change"
    // clicks; "Done" is the explicit way to collapse it.
    variantUpdate.mutate({ itemId: item.id, variantId: match.id });
  };

  const variantErrorMessage = noMatchError
    ? t("That combination isn't available.", 'هذا الخيار غير متوفر.')
    : variantUpdate.isError
      ? isApiError(variantUpdate.error) && variantUpdate.error.code === 'OUT_OF_STOCK'
        ? t('Not enough stock for that option.', 'الكمية غير متوفرة لهذا الخيار.')
        : t("Couldn't change that option. Try again.", 'تعذّر تغيير هذا الخيار. حاول مرة أخرى.')
      : null;

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

            {!editingVariant && (variantBits || canChangeVariant) && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  flexWrap: 'wrap',
                  color: 'var(--color-text-muted)',
                }}
              >
                {variantBits}
                {canChangeVariant && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingVariant(true)} disabled={busy}>
                    {t('Change', 'تغيير')}
                  </Button>
                )}
              </span>
            )}

            {editingVariant && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--space-3)',
                  alignItems: 'flex-end',
                  marginBlock: 'var(--space-1)',
                }}
              >
                {canChangeSize && (
                  <div style={{ minWidth: '6.5rem' }}>
                    <Field label={t('Size', 'المقاس')}>
                      {(p) => (
                        <Select
                          {...p}
                          value={selectedSize}
                          disabled={variantUpdate.isPending}
                          onChange={(e) => {
                            setSelectedSize(e.target.value);
                            applyVariantChange(e.target.value, selectedColor);
                          }}
                        >
                          {sizes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  </div>
                )}
                {canChangeColor && (
                  <div style={{ minWidth: '7.5rem' }}>
                    <Field label={t('Color', 'اللون')}>
                      {(p) => (
                        <Select
                          {...p}
                          value={selectedColor}
                          disabled={variantUpdate.isPending}
                          onChange={(e) => {
                            setSelectedColor(e.target.value);
                            applyVariantChange(selectedSize, e.target.value);
                          }}
                        >
                          {colors.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingVariant(false)}
                  disabled={variantUpdate.isPending}
                >
                  {t('Done', 'تم')}
                </Button>
              </div>
            )}

            {variantErrorMessage && (
              <span role="alert" style={{ color: 'var(--color-danger-text)' }}>
                {variantErrorMessage}
              </span>
            )}

            <PriceTag
              price={product.price}
              compareAtPrice={product.compareAtPrice}
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
            onClick={() => remove.mutate({ itemId: item.id })}
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
