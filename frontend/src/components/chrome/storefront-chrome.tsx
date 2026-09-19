'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { WhatsappBubble } from '@/components/chrome/whatsapp-bubble';

/**
 * Customer-facing chrome (offers strip, topbar with search/cart/account,
 * footer, WhatsApp bubble) — every route got it unconditionally from the
 * root layout, admin panel included, since nothing gated it off. Staff
 * managing orders have no use for a shopping cart or a "chat with us on
 * WhatsApp" support widget, and the admin panel now has its own persistent
 * shell (sidebar / mobile nav) that a second, unrelated topbar sitting above
 * it would visually collide with. Hidden on `/admin` and the disguised
 * `/ali-admin-login` entry point; every other route is unaffected.
 */
export function StorefrontChrome({ locale, children }: { locale: string; children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const base = `/${locale}`;
  const isAdmin =
    pathname === `${base}/admin` ||
    pathname.startsWith(`${base}/admin/`) ||
    pathname === `${base}/ali-admin-login` ||
    pathname.startsWith(`${base}/ali-admin-login/`);

  if (isAdmin) return <>{children}</>;

  return (
    <>
      <SiteHeader locale={locale} />
      {children}
      <SiteFooter locale={locale} />
      <WhatsappBubble locale={locale} />
    </>
  );
}
