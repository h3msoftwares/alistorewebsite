import type { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'sale' | 'save' | 'new' | 'low-stock' | 'restock';
  children: ReactNode;
}

/** Small label pill on the .badge class. `save` renders the Saxon-style
 *  "Save $X.00" corner badge; pass the formatted amount as children. */
export function Badge({ variant = 'sale', className, children, ...rest }: BadgeProps) {
  return (
    <span className={['badge', `badge--${variant}`, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  );
}
