import type { ButtonHTMLAttributes } from 'react';

export interface SwatchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Colour name, already in the caller's display language — becomes the
   *  accessible label ("Colour: Navy" / "اللون: كحلي"). See
   *  lib/product-variants.ts's `colorNameLabel` for the AR translation. */
  colorName: string;
  /** Which language the "Colour:" label prefix itself renders in. */
  locale?: 'en' | 'ar';
  /** Product photo for this colourway (Saxon shows the garment, not a flat dot). */
  imageUrl?: string;
  /** Fallback flat colour when no photo is available. */
  swatchColor?: string;
  selected?: boolean;
  outOfStock?: boolean;
  /** Static label mode: renders a non-interactive `<span>` (no button, no
   *  press/disabled semantics, no click) with the same `.swatch` visuals. Used
   *  where colours are shown purely as labels — e.g. the home page product card. */
  readOnly?: boolean;
}

/** Colour swatch — a product-photo thumbnail per colourway, on the .swatch class. */
export function Swatch({
  colorName,
  locale = 'en',
  imageUrl,
  swatchColor,
  selected = false,
  outOfStock = false,
  readOnly = false,
  className,
  style,
  ...rest
}: SwatchProps) {
  const swatchStyle = swatchColor && !imageUrl ? { ...style, background: swatchColor } : style;
  const img =
    // eslint-disable-next-line @next/next/no-img-element -- 44px decorative thumbnail; next/image fill is overkill here
    imageUrl ? <img className="swatch__img" src={imageUrl} alt="" /> : null;
  const label = `${locale === 'ar' ? 'اللون' : 'Colour'}: ${colorName}`;

  if (readOnly) {
    return (
      <span
        className={['swatch', className].filter(Boolean).join(' ')}
        aria-disabled={outOfStock || undefined}
        title={colorName}
        aria-label={label}
        style={swatchStyle}
      >
        {img}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={['swatch', className].filter(Boolean).join(' ')}
      data-selected={selected || undefined}
      aria-pressed={selected}
      aria-disabled={outOfStock || undefined}
      disabled={outOfStock}
      aria-label={label}
      title={colorName}
      style={swatchStyle}
      {...rest}
    >
      {img}
    </button>
  );
}
