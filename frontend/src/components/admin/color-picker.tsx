'use client';

import { X } from 'lucide-react';
import { Icon } from '@/components/ui';

export interface ColorPickerProps {
  /** Hex colour, e.g. "#190066" — '' means no colour for this variant. */
  value: string;
  onChange: (value: string) => void;
  locale: 'en' | 'ar';
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

const FALLBACK_HEX = '#000000';

/**
 * Colour field for a variant — a native round RGB colour-wheel swatch
 * (`input[type=color]`, same round-swatch styling as the storefront's
 * colour circles) plus the picked hex value and a clear button. The
 * variant's colour is stored as the exact hex string the admin picks.
 */
export function ColorPicker({
  value,
  onChange,
  locale,
  disabled,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: ColorPickerProps) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const hasColor = value.trim() !== '';

  return (
    <div className="colour-field" aria-describedby={describedBy} aria-invalid={invalid}>
      <input
        type="color"
        id={id}
        className="colour-field__swatch"
        value={hasColor ? value : FALLBACK_HEX}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={t('Colour', 'اللون')}
      />
      <span className="colour-field__value">{hasColor ? value.toUpperCase() : t('No colour', 'بلا لون')}</span>
      {hasColor && (
        <button
          type="button"
          className="icon-btn icon-btn--bordered"
          onClick={() => onChange('')}
          disabled={disabled}
          aria-label={t('Clear colour', 'إزالة اللون')}
          title={t('Clear colour', 'إزالة اللون')}
        >
          <Icon as={X} size={14} />
        </button>
      )}
    </div>
  );
}
