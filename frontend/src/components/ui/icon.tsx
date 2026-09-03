import type { LucideIcon, LucideProps } from 'lucide-react';

export interface IconProps extends Omit<LucideProps, 'ref'> {
  /** Any icon from `lucide-react`, e.g. `import { ShoppingBag } from 'lucide-react'`. */
  as: LucideIcon;
  /** Directional icons (chevrons, arrows) mirror under [dir='rtl']. */
  flipRtl?: boolean;
}

/**
 * House wrapper over lucide-react so every icon in the app shares one set of
 * defaults (stroke width, size, decorative-by-default). Pass `aria-label` (or
 * `title`) to make an icon meaningful to assistive tech; otherwise it's hidden.
 *
 *   <Icon as={ShoppingBag} />
 *   <Icon as={ChevronRight} flipRtl />
 *   <Icon as={AlertCircle} aria-label="Error" />
 */
export function Icon({
  as: Glyph,
  flipRtl = false,
  size = 20,
  strokeWidth = 1.75,
  className,
  'aria-label': ariaLabel,
  ...rest
}: IconProps) {
  const classes = [flipRtl ? 'icon-flip' : null, className].filter(Boolean).join(' ') || undefined;
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={classes}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
      {...rest}
    />
  );
}
