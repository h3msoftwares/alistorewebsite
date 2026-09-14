/**
 * Formats a currency amount for the storefront's two locales.
 *
 * Arabic UI stays fully Arabic — currency-symbol placement, digit-group and
 * decimal separators, RTL ordering all come from `ar-EG` — but digits are
 * forced to the Western/Latin numbering system rather than `ar-EG`'s CLDR
 * default (Arabic-Indic, ٠١٢٣٤٥٦٧٨٩). That's requested two ways at once: via
 * the `-u-nu-latn` Unicode locale extension on the tag itself, and via the
 * `numberingSystem` option. Node/V8 honours either alone, but some WebKit
 * builds have been seen to ignore the bare `numberingSystem` option for
 * `ar-EG` currency formatting and fall back to Arabic-Indic digits — the
 * locale-tag extension is the one that's reliably honoured everywhere, so
 * it's the one that must not be dropped even though it looks redundant with
 * the option below.
 */
export function formatCurrency(amount: number, locale: 'en' | 'ar', currency = 'USD'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
    style: 'currency',
    currency,
    numberingSystem: 'latn',
  }).format(amount);
}
