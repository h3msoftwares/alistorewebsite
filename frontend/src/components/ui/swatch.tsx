import type { ButtonHTMLAttributes } from 'react';

export interface SwatchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Colour name — becomes the accessible label ("Colour: Navy"). */
  colorName: string;
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

  if (readOnly) {
    return (
      <span
        className={['swatch', className].filter(Boolean).join(' ')}
        aria-disabled={outOfStock || undefined}
        title={colorName}
        aria-label={`Colour: ${colorName}`}
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
      aria-label={`Colour: ${colorName}`}
      title={colorName}
      style={swatchStyle}
      {...rest}
    >
      {img}
    </button>
  );
}
