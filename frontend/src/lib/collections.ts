import type { CSSProperties } from 'react';

// Collections are an owner-editable backend table now (no fixed Women/Men/Kids
// list). Each collection carries an optional `accentColor` (#rrggbb); the
// storefront turns it into the `--collection-*` CSS custom properties that the
// design system already reads (see globals.css `:root` fallbacks and
// `.btn--accent`, `.collection-section__title`, `.product-card`).

/** WCAG relative luminance of a `#rrggbb` hex (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 0;
  const chan = (h: string) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(m[1]) + 0.7152 * chan(m[2]) + 0.0722 * chan(m[3]);
}

/** Inline CSS custom properties for a collection's compound accent.
 *  `{}` for a null/empty hex ⇒ the element inherits the `:root` defaults.
 *  `--collection-accent-soft` is a CSS `color-mix()` tint; `--collection-on-accent`
 *  is picked here (dark ink on light accents, white otherwise). */
export function accentStyle(hex?: string | null): CSSProperties {
  if (!hex) return {};
  const onAccent = luminance(hex) > 0.4 ? '#1c1917' : '#ffffff';
  return {
    ['--collection-accent' as string]: hex,
    ['--collection-accent-soft' as string]: `color-mix(in srgb, ${hex} 12%, white)`,
    ['--collection-on-accent' as string]: onAccent,
  };
}
