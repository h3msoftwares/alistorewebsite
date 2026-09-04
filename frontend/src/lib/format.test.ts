import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format';

// U+0660–U+0669: Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) — what ar-EG renders by
// default without forcing numberingSystem: 'latn'.
const ARABIC_INDIC_DIGIT = /[٠-٩]/;

describe('formatCurrency', () => {
  it('formats an English amount with Western digits and en-US conventions', () => {
    expect(formatCurrency(1234.5, 'en', 'USD')).toBe('$1,234.50');
  });

  it('formats an Arabic-locale amount with Western digits, not Arabic-Indic', () => {
    const out = formatCurrency(1234.5, 'ar', 'USD');
    expect(ARABIC_INDIC_DIGIT.test(out)).toBe(false);
    expect(out).toContain('1,234.50'); // Western digits + en-style grouping/decimal separators
  });

  it('keeps Arabic currency-symbol placement/separators — only the digit script changes', () => {
    // ar-EG places the currency symbol after the amount ("... US$"), unlike
    // en-US's leading "$1,234.50" — confirms locale conventions besides
    // digits are untouched by forcing numberingSystem: 'latn'.
    expect(formatCurrency(1234.5, 'ar', 'USD')).toBe('\u200F1,234.50 US$');
  });

  it('defaults to USD when no currency is given', () => {
    expect(formatCurrency(10, 'en')).toBe('$10.00');
  });

  it('respects a different currency code', () => {
    expect(formatCurrency(10, 'en', 'EUR')).toBe('€10.00');
  });
});
