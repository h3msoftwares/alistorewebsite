import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface ChoiceProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  type?: 'checkbox' | 'radio';
  label: ReactNode;
}

/** Checkbox / radio with an inline label, on the shared .choice class.
 *  44px min row height for touch. Used by filter panels and forms. */
export const Choice = forwardRef<HTMLInputElement, ChoiceProps>(function Choice(
  { type = 'checkbox', label, className, ...rest },
  ref,
) {
  return (
    <label className={['choice', className].filter(Boolean).join(' ')}>
      <input ref={ref} type={type} {...rest} />
      <span>{label}</span>
    </label>
  );
});
