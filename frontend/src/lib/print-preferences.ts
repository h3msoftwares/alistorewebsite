// Per-device receipt-printing preferences (admin Orders page's "Print
// settings"). Deliberately NOT part of the shared SiteSettings API —
// different admin computers/locations plausibly have different physical
// receipt printers, so this lives in this browser's localStorage only,
// same pattern as reset-return.ts / use-favourites.ts's guest list.

export type ReceiptFormat = 'standard' | 'compact';

export interface PrintPreferences {
  /** 'standard' = full-page (A4-ish) receipt. 'compact' = narrow,
   *  supermarket/thermal-roll-style layout. */
  receiptFormat: ReceiptFormat;
  /** Free-text reminder of which connected printer to pick in the
   *  browser's print dialog — a website can't enumerate or silently select
   *  a system printer, so this is advisory only, shown next to the print
   *  button, not an actual printer handle. */
  printerName: string;
}

const LS_KEY = 'alistore:print-preferences';
const DEFAULTS: PrintPreferences = { receiptFormat: 'standard', printerName: '' };

export function readPrintPreferences(): PrintPreferences {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LS_KEY) ?? '{}');
    return {
      receiptFormat: parsed?.receiptFormat === 'compact' ? 'compact' : 'standard',
      printerName: typeof parsed?.printerName === 'string' ? parsed.printerName : '',
    };
  } catch {
    return DEFAULTS;
  }
}

export function writePrintPreferences(prefs: PrintPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota — preference just won't persist */
  }
}
