'use client';

import { MessageCircle } from 'lucide-react';
import { Icon } from '@/components/ui';
import { useSettings } from '@/hooks/use-settings';

/** Defence in depth for the admin-set link — only ever emit an href for an
 *  absolute http(s) URL (mirrors site-footer / store-info's guard). */
function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Floating WhatsApp button pinned to the bottom corner of every page. Sends the
 * shopper to the number the owner set in /admin/settings — the "WhatsApp" link
 * URL when given, otherwise a `wa.me` link built from the contact phone.
 * Renders nothing when neither is set. The corner flips with the writing
 * direction (bottom-left under RTL) via logical properties.
 */
export function WhatsappBubble({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const { data: settings } = useSettings();

  const fromUrl = safeHttpUrl(settings?.whatsappUrl);
  const digits = (settings?.contactPhone ?? '').replace(/\D/g, '');
  const href = fromUrl ?? (digits.length >= 6 ? `https://wa.me/${digits}` : undefined);
  if (!href) return null;

  const label = isAr ? 'تواصل معنا عبر واتساب' : 'Chat with us on WhatsApp';

  return (
    <a
      className="whatsapp-bubble"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      <Icon as={MessageCircle} size={28} />
    </a>
  );
}
