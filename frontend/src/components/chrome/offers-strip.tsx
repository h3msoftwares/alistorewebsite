'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Icon } from '@/components/ui/icon';

// Structure only — copy is placeholder. TODO: source offers from a small
// admin-editable list (or a `settings` endpoint) and rotate them.
const OFFERS: { en: string; ar: string }[] = [
  { en: 'Free delivery inside the city on orders over $30', ar: 'توصيل مجاني داخل المدينة للطلبات فوق 30$' },
  { en: 'Cash on delivery — pay when it arrives', ar: 'الدفع عند الاستلام — ادفع عند وصول الطلب' },
  { en: 'New season styles just landed', ar: 'تشكيلة الموسم الجديد وصلت الآن' },
];

const ROTATE_MS = 6000;

/** The promo strip above the topbar. Rotates through a few messages and can be
 *  dismissed for the session. */
export function OffersStrip({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (dismissed || OFFERS.length < 2) return;
    // Respect reduced-motion: don't auto-cycle the message.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % OFFERS.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [dismissed]);

  if (dismissed) return null;

  const offer = OFFERS[index];

  return (
    <div className="offers-strip" role="region" aria-label={isAr ? 'العروض' : 'Offers'}>
      <div className="offers-strip__inner container">
        <p className="offers-strip__message" aria-live="polite">
          {isAr ? offer.ar : offer.en}
        </p>
        <button
          type="button"
          className="offers-strip__close"
          aria-label={isAr ? 'إغلاق' : 'Dismiss'}
          onClick={() => setDismissed(true)}
        >
          <Icon as={X} size={14} />
        </button>
      </div>
    </div>
  );
}
