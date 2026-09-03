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
}

/** Colour swatch — a product-photo thumbnail per colourway, on the .swatch class. */
export function Swatch({
  colorName,
  imageUrl,
  swatchColor,
  selected = false,
  outOfStock = false,
  className,
  style,
  ...rest
}: SwatchProps) {
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
      style={swatchColor && !imageUrl ? { ...style, background: swatchColor } : style}
      {...rest}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 44px decorative thumbnail; next/image fill is overkill here */}
      {imageUrl && <img className="swatch__img" src={imageUrl} alt="" />}
    </button>
  );
}
