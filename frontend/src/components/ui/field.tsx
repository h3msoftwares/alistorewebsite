import { useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Icon } from './icon';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FieldProps {
  label: ReactNode;
  /** Persistent helper text below the control. */
  hint?: ReactNode;
  /** Error message — when set, the control is marked invalid and described by it. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Render the control, spreading the wiring props onto it. */
  children: (props: FieldControlProps) => ReactNode;
}

/**
 * Label + helper + error shell for a single form control. Generates the id and
 * the `aria-describedby` / `aria-invalid` wiring and hands them to `children`.
 * Form-library binding (React Hook Form + Zod) stays with the caller.
 *
 *   <Field label="Phone" error={errors.phone?.message} required>
 *     {(p) => <Input type="tel" {...p} {...register('phone')} />}
 *   </Field>
 */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}

      {hint && !error && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={errorId} role="alert">
          <Icon as={AlertCircle} size={14} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
