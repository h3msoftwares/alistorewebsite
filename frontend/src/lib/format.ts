/**
 * Formats a currency amount for the storefront's two locales.
 *
 * Arabic UI stays fully Arabic — currency-symbol placement, digit-group and
 * decimal separators, RTL ordering all come from `ar-EG` — but digits are
 * forced to the Western/Latin numbering system (`numberingSystem: 'latn'`)
 * rather than `ar-EG`'s CLDR default (Arabic-Indic, ٠١٢٣٤٥٦٧٨٩). Verified
 * empirically (see product-variants.test.ts-style check in format.test.ts):
 * without this option, `ar-EG` renders Arabic-Indic digits.
 */
export function formatCurrency(amount: number, locale: 'en' | 'ar', currency = 'USD'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    style: 'currency',
    currency,
    numberingSystem: 'latn',
  }).format(amount);
}
