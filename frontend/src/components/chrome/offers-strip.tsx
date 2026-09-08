'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { useSettings } from '@/hooks/use-settings';

const ROTATE_MS = 6000;

/** The promo strip above the topbar. Lines + on/off come from the admin's
 *  site settings; rotates through them and can be dismissed for the session. */
export function OffersStrip({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const { data: settings } = useSettings();
  const lines = settings?.announcementLines ?? [];
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (dismissed || lines.length < 2) return;
    // Respect reduced-motion: don't auto-cycle the message.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % lines.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [dismissed, lines.length]);

  // While settings haven't resolved yet (only possible when the layout's SSR
  // prefetch failed — e.g. backend down at render time), hold the strip's
  // height with an empty band so its later mount doesn't shift the page.
  if (!settings) {
    return <div className="offers-strip offers-strip--reserve" aria-hidden />;
  }

  if (dismissed || !settings.announcementActive || lines.length === 0) return null;

  const line = lines[index % lines.length];

  return (
    <div className="offers-strip" role="region" aria-label={isAr ? 'العروض' : 'Offers'}>
      <div className="offers-strip__inner container">
        <p className="offers-strip__message" aria-live="polite">
          {isAr ? line.textAr : line.textEn}
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
