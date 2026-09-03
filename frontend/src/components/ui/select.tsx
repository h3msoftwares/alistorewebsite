import { forwardRef, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Thin wrapper over the .select class in globals.css (native <select> with a
 *  custom caret that mirrors under RTL). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={['select', className].filter(Boolean).join(' ')} {...rest} />;
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Thin wrapper over the .textarea class in globals.css. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={['textarea', className].filter(Boolean).join(' ')} {...rest} />;
});
