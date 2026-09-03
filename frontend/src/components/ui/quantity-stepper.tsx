import { Minus, Plus } from 'lucide-react';
import { Icon } from './icon';

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** Accessible name for the value, e.g. "Quantity for Silk Robe". */
  label: string;
  disabled?: boolean;
}

/** −/＋ quantity control on the .qty class. Controlled. Used by cart rows and PDP. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label,
  disabled = false,
}: QuantityStepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="qty">
      <button
        type="button"
        className="qty__btn"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label}`}
      >
        <Icon as={Minus} size={16} />
      </button>
      <span className="qty__value" aria-live="polite" aria-label={label}>
        {value}
      </span>
      <button
        type="button"
        className="qty__btn"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label}`}
      >
        <Icon as={Plus} size={16} />
      </button>
    </div>
  );
}
