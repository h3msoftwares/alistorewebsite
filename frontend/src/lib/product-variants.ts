import type { ProductImage, ProductVariant } from './types';

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

// While the pointer is over a card's photo it steps to the next image every
// HOVER_SCROLL_MS and keeps looping; leaving resets to the first.
export const HOVER_SCROLL_MS = 1600;

/**
 * The photos a hover-scroll gallery moves through for the shown colour:
 * that colour's tagged shots, else the generic (untagged) ones, else all of
 * them.
 *
 * The generic bucket needs MORE than one photo to be worth cycling through —
 * the common catalog shape is a single untagged lead shot plus several
 * colour-tagged ones, so before any swatch is clicked a plain "> 0" check
 * here would leave nothing to advance through at all (gallery stuck at
 * length 1) even though the product genuinely has more photos — hence
 * falling back to every photo instead. `forColor` doesn't need the same
 * widening: once a shopper has actually picked a colour, showing another
 * colour's photo on hover would be visually wrong even if that colour has
 * only one shot of its own.
 */
export function pickImageGallery(images: ProductImage[], color: string | null): ProductImage[] {
  const forColor = color ? images.filter((img) => img.color === color) : [];
  if (forColor.length > 0) return forColor;
  const generic = images.filter((img) => !img.color);
  return generic.length > 1 ? generic : images;
}

/**
 * Curated lookup for the colour names admins actually type when adding a
 * product variant — `ProductVariant.color` is a free-text string with no
 * colour->hex table anywhere in the schema/backend, so this is the closest
 * thing to one: a real, verified CSS value plus an Arabic name for each
 * common clothing colour, keyed on the trimmed/lowercased/single-spaced
 * English name. Extend this list rather than special-casing a name
 * elsewhere — every swatch and every locale goes through it.
 */
const COLOR_NAME_MAP: Record<string, { css: string; ar: string }> = {
  black: { css: '#000000', ar: 'أسود' },
  white: { css: '#ffffff', ar: 'أبيض' },
  'off white': { css: '#f5f0e6', ar: 'أبيض مكسور' },
  ivory: { css: '#fffff0', ar: 'عاجي' },
  cream: { css: '#fffdd0', ar: 'كريمي' },
  beige: { css: '#e8dcc8', ar: 'بيج' },
  khaki: { css: '#c3b091', ar: 'كاكي' },
  tan: { css: '#d2b48c', ar: 'بني فاتح' },
  camel: { css: '#c19a6b', ar: 'بيج غامق' },
  brown: { css: '#8b5a2b', ar: 'بني' },
  chocolate: { css: '#7b3f00', ar: 'بني غامق' },
  grey: { css: '#808080', ar: 'رمادي' },
  gray: { css: '#808080', ar: 'رمادي' },
  charcoal: { css: '#36454f', ar: 'رمادي غامق' },
  silver: { css: '#c0c0c0', ar: 'فضي' },
  red: { css: '#c1272d', ar: 'أحمر' },
  maroon: { css: '#800000', ar: 'خمري' },
  burgundy: { css: '#6d071a', ar: 'عنابي' },
  wine: { css: '#722f37', ar: 'نبيذي' },
  pink: { css: '#f4a3c1', ar: 'وردي' },
  'hot pink': { css: '#ff69b4', ar: 'وردي فاقع' },
  rose: { css: '#c78283', ar: 'وردي غامق' },
  fuchsia: { css: '#ff00ff', ar: 'فوشيا' },
  orange: { css: '#f5821f', ar: 'برتقالي' },
  coral: { css: '#ff7f50', ar: 'مرجاني' },
  peach: { css: '#ffdab9', ar: 'خوخي' },
  yellow: { css: '#f4d03f', ar: 'أصفر' },
  gold: { css: '#cf9d4c', ar: 'ذهبي' },
  mustard: { css: '#d4ac0d', ar: 'خردلي' },
  green: { css: '#2e8b57', ar: 'أخضر' },
  olive: { css: '#708238', ar: 'زيتوني' },
  mint: { css: '#98ff98', ar: 'نعناعي' },
  emerald: { css: '#50c878', ar: 'زمردي' },
  teal: { css: '#008080', ar: 'أزرق مخضر' },
  turquoise: { css: '#40e0d0', ar: 'فيروزي' },
  blue: { css: '#2a6fdb', ar: 'أزرق' },
  navy: { css: '#190066', ar: 'كحلي' },
  'navy blue': { css: '#190066', ar: 'كحلي' },
  'sky blue': { css: '#87ceeb', ar: 'أزرق سماوي' },
  'light blue': { css: '#add8e6', ar: 'أزرق فاتح' },
  'royal blue': { css: '#4169e1', ar: 'أزرق ملكي' },
  denim: { css: '#1560bd', ar: 'جينز' },
  purple: { css: '#7b3fa0', ar: 'بنفسجي' },
  lavender: { css: '#b57edc', ar: 'لافندر' },
  lilac: { css: '#c8a2c8', ar: 'ليلكي' },
  violet: { css: '#8f00ff', ar: 'أرجواني' },
  multicolor: { css: '#c9c9c9', ar: 'متعدد الألوان' },
  multicolour: { css: '#c9c9c9', ar: 'متعدد الألوان' },
  assorted: { css: '#c9c9c9', ar: 'متنوع' },
};

function normalizeColorKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A real CSS colour for a free-text colour name — the curated map above
 * first, so a swatch actually paints a colour circle instead of guessing.
 * Falls back to the old best-effort strip-spaces heuristic ("Light Blue" ->
 * "lightblue") for a name outside the map that happens to already be a
 * valid CSS keyword once collapsed; the browser silently ignores anything
 * that still isn't, so an unmapped/unusual name never breaks the swatch —
 * it just falls back to a plain surface colour instead of painting one.
 */
export function colorNameToCss(name: string): string {
  const known = COLOR_NAME_MAP[normalizeColorKey(name)];
  if (known) return known.css;
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

/** The colour name to actually show a shopper: translated to Arabic for a
 *  colour in the curated map above, else the raw admin-typed name unchanged
 *  (an English UI, or a custom name the map doesn't cover, e.g. "Ali Blue"). */
export function colorNameLabel(name: string, locale: 'en' | 'ar'): string {
  if (locale !== 'ar') return name;
  return COLOR_NAME_MAP[normalizeColorKey(name)]?.ar ?? name;
}
