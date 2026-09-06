import type { ButtonHTMLAttributes } from 'react';

export interface SizeChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  selected?: boolean;
  /** Out-of-stock: shown struck-through and non-interactive, but still announced. */
  outOfStock?: boolean;
  /** Static label mode: renders a non-interactive `<span>` (no button, no
   *  press/disabled semantics, no click) with the same `.chip` visuals. Used
   *  where sizes are shown purely as labels — e.g. the home page product card. */
  readOnly?: boolean;
}

/** Text size chip (S / M / L / XL …) — Saxon uses chips, not a dropdown.
 *  Renders on the .chip class. Group several in a `.chip-group`. */
export function SizeChip({
  selected = false,
  outOfStock = false,
  readOnly = false,
  className,
  children,
  ...rest
}: SizeChipProps) {
  if (readOnly) {
    return (
      <span className={['chip', className].filter(Boolean).join(' ')} aria-disabled={outOfStock || undefined}>
        {children}
      </span>
    );
  }
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
