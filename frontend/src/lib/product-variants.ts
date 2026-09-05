import type { ProductVariant } from './types';

export interface VariantSelection {
  size: string | null;
  color: string | null;
}

/** Whether any variant defines this axis at all — an axis where every
 *  variant is null (one-size / no-colour products) shouldn't render a
 *  picker for it. */
export function hasSizeAxis(variants: ProductVariant[]): boolean {
  return variants.some((v) => v.size != null);
}

export function hasColorAxis(variants: ProductVariant[]): boolean {
  return variants.some((v) => v.color != null);
}

/** Distinct sizes across all variants, in first-seen order. There's no
 *  canonical S/M/L ordering anywhere in the schema/backend to sort by. */
export function getSizeOptions(variants: ProductVariant[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    if (v.size != null && !seen.has(v.size)) {
      seen.add(v.size);
      out.push(v.size);
    }
  }
  return out;
}

export function getColorOptions(variants: ProductVariant[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    if (v.color != null && !seen.has(v.color)) {
      seen.add(v.color);
      out.push(v.color);
    }
  }
  return out;
}

/** True when every variant matching `value` on `axis` — crossed with
 *  `other` on the opposite axis when one is already chosen — is out of
 *  stock, or no such variant exists at all. Used to disable a chip/swatch
 *  before the shopper finishes picking a combination that can't be
 *  fulfilled, the same way the /dev/ui showcase disables one. */
export function isOptionOutOfStock(
  variants: ProductVariant[],
  axis: 'size' | 'color',
  value: string,
  other: string | null
): boolean {
  const otherAxis = axis === 'size' ? 'color' : 'size';
  const candidates = variants.filter(
    (v) => v[axis] === value && (other == null || v[otherAxis] === other)
  );
  if (candidates.length === 0) return true;
  return candidates.every((v) => v.stockQuantity <= 0);
}

/** Resolves the exact ProductVariant for a selection, once every axis the
 *  product actually uses has been chosen. Axes the product doesn't use
 *  (always null) are ignored rather than required. */
export function resolveVariant(
  variants: ProductVariant[],
  selection: VariantSelection
): ProductVariant | undefined {
  const needsSize = hasSizeAxis(variants);
  const needsColor = hasColorAxis(variants);
  if (needsSize && selection.size == null) return undefined;
  if (needsColor && selection.color == null) return undefined;
  return variants.find(
    (v) =>
      (needsSize ? v.size === selection.size : true) &&
      (needsColor ? v.color === selection.color : true)
  );
}

/** The variant "Add to cart" should use when the shopper hasn't picked a
 *  size/colour themselves — e.g. from a favourites list, which is
 *  product-level. First in-stock variant, or the first variant if none has
 *  stock (so callers can still show it and disable the button). `undefined`
 *  only for a product with no variants at all. */
export function firstPurchasableVariant(variants: ProductVariant[]): ProductVariant | undefined {
  return variants.find((v) => v.stockQuantity > 0) ?? variants[0];
}

/**
 * Best-effort CSS colour guess from a free-text colour name (e.g. "Navy" ->
 * "navy", "Light Blue" -> "lightblue"). There is no colour->hex table
 * anywhere in the schema or backend to draw from — `ProductVariant.color`
 * is just a free-text string an admin typed in — so this only resolves
 * names that happen to already be (or collapse to) a valid CSS colour
 * keyword. Anything else ("Rose", "Assorted", ...) becomes a string that
 * isn't a valid CSS value; the browser silently ignores an invalid
 * `background` value rather than erroring, so the swatch just falls back
 * to its plain surface colour — it never breaks, it just doesn't paint.
 * The real colour name is still conveyed via Swatch's accessible label.
 */
export function colorNameToCss(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}
