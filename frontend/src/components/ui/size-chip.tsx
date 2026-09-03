import type { ButtonHTMLAttributes } from 'react';

export interface SizeChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  selected?: boolean;
  /** Out-of-stock: shown struck-through and non-interactive, but still announced. */
  outOfStock?: boolean;
}

/** Text size chip (S / M / L / XL …) — Saxon uses chips, not a dropdown.
 *  Renders on the .chip class. Group several in a `.chip-group`. */
export function SizeChip({ selected = false, outOfStock = false, className, children, ...rest }: SizeChipProps) {
  return (
    <button
      type="button"
      className={['chip', className].filter(Boolean).join(' ')}
      aria-pressed={selected}
      aria-disabled={outOfStock || undefined}
      disabled={outOfStock}
      {...rest}
    >
      {children}
    </button>
  );
}
