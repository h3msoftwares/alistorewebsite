'use client';

import { usePathname } from 'next/navigation';
import { DatabaseBackup, Mail, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ADMIN_SECTIONS, usePermissions, type AdminNavGroup } from '@/lib/rbac';

export interface AdminNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  group: AdminNavGroup;
  active: boolean;
}

/**
 * Single source of truth for the admin nav: permission-filtered
 * `ADMIN_SECTIONS` plus the two ADMIN-role-only utility links (Backup, Mail),
 * with active-state resolved against the current pathname. Consumed by both
 * `AdminSidebar` (desktop) and `AdminMobileNav` (bottom tabs + drawer) so the
 * two never drift — this replaces the logic that used to live only inside
 * `admin-nav.tsx`.
 */
export function useAdminNavItems(locale: string): AdminNavItem[] {
  const pathname = usePathname() ?? '';
  const isAr = locale === 'ar';
  const base = `/${locale}/admin`;
  const { has } = usePermissions();
  const { user } = useAuth();

  // Sections can nest (Orders `/orders` vs Returns `/orders/returns`), so a
  // plain `startsWith` would light up both for a `/orders/returns` pathname.
  // Only the most specific (longest-href) match should be active.
  const candidates = ADMIN_SECTIONS.filter((s) => has(s.permission)).map((s) => {
    const href = `${base}${s.href}`;
    const matches = s.href === '' ? pathname === base : pathname.startsWith(href);
    return { section: s, href, matches };
  });
  const bestMatch = candidates
    .filter((c) => c.matches)
    .reduce<(typeof candidates)[number] | null>(
      (best, c) => (!best || c.href.length > best.href.length ? c : best),
      null
    );

  const items: AdminNavItem[] = candidates.map(({ section: s, href }) => ({
    key: s.href || 'dashboard',
    href,
    label: isAr ? s.labelAr : s.labelEn,
    icon: s.icon,
    group: s.group,
    active: href === bestMatch?.href,
  }));

  // Database backups & outgoing mail: gated on the role itself (ADMIN only),
  // not the permission system every other section uses — see the identical
  // comment that used to live in admin-nav.tsx.
  if (user?.role === 'ADMIN') {
    const backupHref = `${base}/backup`;
    const mailHref = `${base}/mail`;
    items.push(
      {
        key: 'backup',
        href: backupHref,
        label: isAr ? 'النسخ الاحتياطي' : 'Backups',
        icon: DatabaseBackup,
        group: 'system',
        active: pathname.startsWith(backupHref),
      },
      {
        key: 'mail',
        href: mailHref,
        label: isAr ? 'البريد الصادر' : 'Mail',
        icon: Mail,
        group: 'system',
        active: pathname.startsWith(mailHref),
      },
    );
  }

  return items;
}

export interface AdminNavGroupedItems {
  group: AdminNavItem['group'];
  items: AdminNavItem[];
}

/** Buckets consecutive same-group items together for a grouped nav list —
 *  `ADMIN_SECTIONS` is already ordered by group, so this never re-sorts. */
export function groupAdminNavItems(items: AdminNavItem[]): AdminNavGroupedItems[] {
  const out: AdminNavGroupedItems[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else out.push({ group: item.group, items: [item] });
  }
  return out;
}
