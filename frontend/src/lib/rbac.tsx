'use client';

/**
 * Central RBAC map for the admin panel — the single place that says which
 * permission each admin page and backend route needs, plus the hooks/components
 * that gate on the current user's effective permissions.
 *
 * KEEP `PERMISSION_AREAS` IN SYNC with backend/src/lib/permissions.ts. The
 * backend is the authority (it computes `user.permissions`); this file just
 * mirrors the catalog for labels + client-side gating.
 */

import { useMemo, type ReactNode } from 'react';
import {
  LayoutGrid,
  Layers,
  Tag,
  Package,
  Percent,
  Combine,
  ShoppingBag,
  RotateCcw,
  Users,
  BarChart2,
  Shield,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { PermissionArea } from '@/lib/types';

// ---------------------------------------------------------------- catalog ----

export const PERMISSION_AREAS: PermissionArea[] = [
  { area: 'dashboard', label: 'Dashboard', levels: ['view'] },
  { area: 'orders', label: 'Orders', levels: ['view', 'manage'] },
  { area: 'customers', label: 'Customers', levels: ['view', 'manage'] },
  { area: 'products', label: 'Products', levels: ['view', 'manage'] },
  { area: 'collections', label: 'Collections', levels: ['view', 'manage'] },
  { area: 'categories', label: 'Categories', levels: ['view', 'manage'] },
  { area: 'discounts', label: 'Discounts & coupons', levels: ['view', 'manage'] },
  // Deliberately its own area, not folded into 'discounts' — see
  // backend/src/lib/permissions.ts's matching comment.
  { area: 'combos', label: 'Combo & tiered pricing', levels: ['view', 'manage'] },
  { area: 'loyalty', label: 'Loyalty program', levels: ['view', 'manage'] },
  { area: 'analytics', label: 'Analytics', levels: ['view'] },
  { area: 'settings', label: 'Store settings', levels: ['view', 'manage'] },
  { area: 'roles', label: 'Permissions & roles', levels: ['view', 'manage'] },
];

const AREA_LABEL_AR: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  orders: 'الطلبات',
  customers: 'الزبائن',
  products: 'المنتجات',
  collections: 'المجموعات',
  categories: 'الفئات',
  discounts: 'الخصومات والقسائم',
  combos: 'التسعير التجميعي',
  loyalty: 'برنامج الولاء',
  analytics: 'التحليلات',
  settings: 'إعدادات المتجر',
  roles: 'الصلاحيات والأدوار',
};
export const areaLabel = (area: string, locale: 'en' | 'ar') =>
  locale === 'ar'
    ? AREA_LABEL_AR[area] ?? area
    : PERMISSION_AREAS.find((a) => a.area === area)?.label ?? area;

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_AREAS.flatMap((a) =>
  a.levels.map((l) => `${a.area}:${l}`)
);
const ALL_SET = new Set(ALL_PERMISSION_KEYS);

/** Add the implied `<area>:view` whenever `<area>:manage` is present. */
export function expandImplied(keys: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const k of keys) {
    if (!ALL_SET.has(k)) continue;
    out.add(k);
    if (k.endsWith(':manage')) out.add(`${k.slice(0, -':manage'.length)}:view`);
  }
  return out;
}

// ------------------------------------------------ admin nav / route map ----

/** Groups the sidebar/mobile-drawer nav into labelled clusters. */
export type AdminNavGroup = 'overview' | 'catalog' | 'sales' | 'insights' | 'system';

export interface AdminSection {
  /** Path relative to `/{locale}/admin` — '' is the dashboard index. */
  href: string;
  labelEn: string;
  labelAr: string;
  /** Permission required to see the nav item and open the page. */
  permission: string;
  icon: LucideIcon;
  group: AdminNavGroup;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: '', labelEn: 'Dashboard', labelAr: 'لوحة التحكم', permission: 'dashboard:view', icon: LayoutGrid, group: 'overview' },
  { href: '/collections', labelEn: 'Collections', labelAr: 'المجموعات', permission: 'collections:view', icon: Layers, group: 'catalog' },
  { href: '/categories', labelEn: 'Categories', labelAr: 'الفئات', permission: 'categories:view', icon: Tag, group: 'catalog' },
  { href: '/products', labelEn: 'Products', labelAr: 'المنتجات', permission: 'products:view', icon: Package, group: 'catalog' },
  { href: '/discounts', labelEn: 'Discounts', labelAr: 'الخصومات', permission: 'discounts:view', icon: Percent, group: 'sales' },
  { href: '/combos', labelEn: 'Combo pricing', labelAr: 'التسعير التجميعي', permission: 'combos:view', icon: Combine, group: 'sales' },
  { href: '/orders', labelEn: 'Orders', labelAr: 'الطلبات', permission: 'orders:view', icon: ShoppingBag, group: 'sales' },
  { href: '/orders/returns', labelEn: 'Returns', labelAr: 'المرتجعات', permission: 'orders:view', icon: RotateCcw, group: 'sales' },
  { href: '/customers', labelEn: 'Customers', labelAr: 'الزبائن', permission: 'customers:view', icon: Users, group: 'sales' },
  { href: '/analytics', labelEn: 'Analytics', labelAr: 'التحليلات', permission: 'analytics:view', icon: BarChart2, group: 'insights' },
  { href: '/roles', labelEn: 'Roles', labelAr: 'الأدوار', permission: 'roles:view', icon: Shield, group: 'system' },
  { href: '/settings', labelEn: 'Settings', labelAr: 'الإعدادات', permission: 'settings:view', icon: SettingsIcon, group: 'system' },
];

export const ADMIN_NAV_GROUP_LABEL: Record<AdminNavGroup, { en: string; ar: string }> = {
  overview: { en: 'Overview', ar: 'نظرة عامة' },
  catalog: { en: 'Catalog', ar: 'الكتالوج' },
  sales: { en: 'Sales', ar: 'المبيعات' },
  insights: { en: 'Insights', ar: 'التحليلات' },
  system: { en: 'System', ar: 'النظام' },
};

/**
 * The permission needed to open a given admin pathname (with or without a
 * `/{locale}` prefix). Longest-prefix match; unknown admin paths return the
 * dashboard permission so a bare `/admin` still gates on something.
 */
export function requiredPermissionForPath(pathname: string): string | null {
  const m = pathname.match(/\/admin(\/.*)?$/);
  if (!m) return null; // not an admin route
  const sub = (m[1] ?? '').replace(/\/$/, '');
  // Most specific section whose href prefixes the path.
  const hit = [...ADMIN_SECTIONS]
    .filter((s) => s.href !== '' && (sub === s.href || sub.startsWith(s.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.permission ?? 'dashboard:view';
}

// ---------------------------------------------------------------- hooks ----

export interface PermissionApi {
  /** Holds this exact key (after expanding `manage ⇒ view`). */
  has: (key: string) => boolean;
  /** Holds at least one of these keys. */
  hasAny: (...keys: string[]) => boolean;
  /** Every permission — an ADMIN with nothing revoked. */
  isFullAdmin: boolean;
  /** The resolved key set. */
  all: Set<string>;
}

export function usePermissions(): PermissionApi {
  const { user } = useAuth();
  return useMemo(() => {
    const all = expandImplied(user?.permissions ?? []);
    return {
      all,
      has: (key: string) => all.has(key),
      hasAny: (...keys: string[]) => keys.some((k) => all.has(k)),
      isFullAdmin: user?.role === 'ADMIN' && all.size === ALL_PERMISSION_KEYS.length,
    };
  }, [user?.permissions, user?.role]);
}

// ------------------------------------------------------------- <Can> gate ----

/**
 * Renders `children` only when the current user holds `permission` (or any of
 * `anyOf`). `fallback` (default: nothing) shows otherwise.
 */
export function Can({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { has, hasAny } = usePermissions();
  const ok = permission ? has(permission) : anyOf ? hasAny(...anyOf) : true;
  return <>{ok ? children : fallback}</>;
}
