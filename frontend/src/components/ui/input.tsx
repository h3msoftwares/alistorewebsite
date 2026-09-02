import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Thin wrapper over the .input class already defined in globals.css.
 *  Deliberately minimal — no label/error/helper-text props. Form-level
 *  concerns (React Hook Form + Zod validation UI) belong to the Week 2+
 *  form tasks that actually build a form around this. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...rest }, ref) {
  const classes = ['input', className].filter(Boolean).join(' ');
  return <input ref={ref} className={classes} {...rest} />;
});
