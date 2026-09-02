import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'accent';
}

/** Thin wrapper over the .btn/.btn--* classes already defined in
 *  globals.css — no new styles, just a typed component so pages don't
 *  hand-roll className strings. */
export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ');
  return <button className={classes} {...rest} />;
}
