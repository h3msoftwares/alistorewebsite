'use client';

import { useEffect, useState } from 'react';
import { OrderReceipt } from '@/components/orders/order-receipt';
import type { Order } from '@/lib/types';
import type { ReceiptFormat } from '@/lib/print-preferences';

/**
 * Triggers a delivery-receipt print for one order. Shared by the admin
 * Orders list and the order detail page so both get the same
 * mount-then-print timing (printing synchronously on click would race the
 * `<OrderReceipt>` render) and the same afterprint cleanup.
 */
export function useOrderReceiptPrint(format: ReceiptFormat, brandName: string, locale: 'en' | 'ar') {
  const [printOrder, setPrintOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!printOrder) return;
    const raf = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(raf);
  }, [printOrder]);

  useEffect(() => {
    const onAfterPrint = () => setPrintOrder(null);
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  return {
    print: setPrintOrder,
    receiptNode: printOrder && <OrderReceipt order={printOrder} locale={locale} brandName={brandName} format={format} />,
  };
}
