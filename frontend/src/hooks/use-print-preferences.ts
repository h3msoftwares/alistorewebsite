'use client';

import { useEffect, useState } from 'react';
import { readPrintPreferences, writePrintPreferences, type PrintPreferences, type ReceiptFormat } from '@/lib/print-preferences';

/** Hydrates from localStorage on mount (the initial useState value runs
 *  before hydration can see `window`, same reason use-favourites.ts's guest
 *  list loads via an effect rather than the initializer) and writes through
 *  on every change. */
export function usePrintPreferences() {
  const [prefs, setPrefs] = useState<PrintPreferences>(() => readPrintPreferences());

  useEffect(() => {
    setPrefs(readPrintPreferences());
  }, []);

  const setReceiptFormat = (receiptFormat: ReceiptFormat) => {
    setPrefs((prev) => {
      const next = { ...prev, receiptFormat };
      writePrintPreferences(next);
      return next;
    });
  };

  const setPrinterName = (printerName: string) => {
    setPrefs((prev) => {
      const next = { ...prev, printerName };
      writePrintPreferences(next);
      return next;
    });
  };

  return { ...prefs, setReceiptFormat, setPrinterName };
}
