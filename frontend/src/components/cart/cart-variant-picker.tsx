'use client';

import { useMemo, useState } from 'react';
import { Button, Field, Select } from '@/components/ui';
import { useUpdateCartItem } from '@/hooks/use-cart';
import { isApiError } from '@/lib/api';
import { colorLabel } from '@/lib/product-variants';
import type { CartItem } from '@/lib/types';

type Locale = 'en' | 'ar';

/**
 * The "size · color · Change" line for a cart line item, with an inline
 * size/color picker. Shared by the full /cart page and the mini-cart drawer
 * so the two surfaces behave identically — a switch goes through the same
 * useUpdateCartItem() mutation (variantId change) the backend repoints/merges.
 *
 * Owns its own mutation + local state. Renders nothing when the product has a
 * single variant and no size/color to show.
 */
export function CartVariantPicker({
  item,
  locale,
  disabled = false,
}: {
  item: CartItem;
  locale: Locale;
  /** Disable the "Change" affordance while the parent runs another op
   *  (quantity / remove) on the same row. */
  disabled?: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const variantUpdate = useUpdateCartItem();

  const { product } = item.variant;
  // item.variant.color is the same free-text-or-hex column colorLabel exists
  // for (see its own doc comment) — confirmed live: joining it in raw showed
  // a shopper "#0A0A0A" instead of a colour name for any variant created via
  // the admin's colour-wheel picker.
  const variantBits = [item.variant.size, item.variant.color ? colorLabel(item.variant.color, locale) : null]
    .filter(Boolean)
    .join(' · ');
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

  const [editing, setEditing] = useState(false);
  const [selectedSize, setSelectedSize] = useState(item.variant.size ?? '');
  const [selectedColor, setSelectedColor] = useState(item.variant.color ?? '');
  const [noMatchError, setNoMatchError] = useState(false);

  // Resync the local picker whenever the server-confirmed variant changes
  // (the row keeps the same cart-item id / React key across a switch, so
  // state wouldn't refresh on its own). Adjusted during render — React's
  // documented pattern for derived-state resets, not an effect.
  const [syncedVariantId, setSyncedVariantId] = useState(item.variant.id);
  if (item.variant.id !== syncedVariantId) {
    setSyncedVariantId(item.variant.id);
    setSelectedSize(item.variant.size ?? '');
    setSelectedColor(item.variant.color ?? '');
    setNoMatchError(false);
  }

  const applyChange = (nextSize: string, nextColor: string) => {
    const match = siblingVariants.find(
      (v) => (v.size ?? '') === nextSize && (v.color ?? '') === nextColor
    );
    if (!match) {
      setNoMatchError(true);
      return;
    }
    setNoMatchError(false);
    if (match.id === item.variant.id) return; // re-picked the current combo — no-op
    // Stays open after a successful switch so picking a new size then a new
    // colour doesn't need two "Change" clicks; "Done" collapses it.
    variantUpdate.mutate({ itemId: item.id, variantId: match.id });
  };

  const errorMessage = noMatchError
    ? t("That combination isn't available.", 'هذا الخيار غير متوفر.')
    : variantUpdate.isError
      ? isApiError(variantUpdate.error) && variantUpdate.error.code === 'OUT_OF_STOCK'
        ? t('Not enough stock for that option.', 'الكمية غير متوفرة لهذا الخيار.')
        : t("Couldn't change that option. Try again.", 'تعذّر تغيير هذا الخيار. حاول مرة أخرى.')
      : null;

  if (!variantBits && !canChangeVariant) return null;

  return (
    <>
      {!editing && (
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={disabled || variantUpdate.isPending}
            >
              {t('Change', 'تغيير')}
            </Button>
          )}
        </span>
      )}

      {editing && (
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
                      applyChange(e.target.value, selectedColor);
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
                      applyChange(selectedSize, e.target.value);
                    }}
                  >
                    {colors.map((c) => (
                      <option key={c} value={c}>
                        {colorLabel(c, locale)}
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
            onClick={() => setEditing(false)}
            disabled={variantUpdate.isPending}
          >
            {t('Done', 'تم')}
          </Button>
        </div>
      )}

      {errorMessage && (
        <span role="alert" style={{ color: 'var(--color-danger-text)' }}>
          {errorMessage}
        </span>
      )}
    </>
  );
}
