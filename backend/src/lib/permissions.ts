import type { UserRole } from '@prisma/client';

/**
 * The admin permission catalog — one "view" and (where there's anything to
 * change) one "manage" permission per admin page. `manage` implies `view`
 * for the same area.
 *
 * KEEP IN SYNC with frontend/src/lib/rbac.tsx (PERMISSION_AREAS). The set of
 * keys is asserted equal by tests/integration/rbac.test.ts against
 * GET /api/admin/permissions.
 */
export interface PermissionArea {
  area: string;
  label: string;
  /** Which levels this area has. Every area has 'view'; most also have 'manage'. */
  levels: ('view' | 'manage')[];
}

export const PERMISSION_AREAS: PermissionArea[] = [
  { area: 'dashboard', label: 'Dashboard', levels: ['view'] },
  { area: 'orders', label: 'Orders', levels: ['view', 'manage'] },
  { area: 'customers', label: 'Customers', levels: ['view', 'manage'] },
  { area: 'products', label: 'Products', levels: ['view', 'manage'] },
  { area: 'collections', label: 'Collections', levels: ['view', 'manage'] },
  { area: 'categories', label: 'Categories', levels: ['view', 'manage'] },
  { area: 'discounts', label: 'Discounts & coupons', levels: ['view', 'manage'] },
  // Deliberately its own area, not folded into 'discounts' — renaming an
  // existing permission key would silently revoke it from every stored
  // Role.permissions row (same reasoning promotionRoutes' own comment gives
  // for keeping the 'discounts:*' keys despite Promotion replacing Discount).
  { area: 'combos', label: 'Combo & tiered pricing', levels: ['view', 'manage'] },
  { area: 'loyalty', label: 'Loyalty program', levels: ['view', 'manage'] },
  { area: 'analytics', label: 'Analytics', levels: ['view'] },
  { area: 'settings', label: 'Store settings', levels: ['view', 'manage'] },
  { area: 'roles', label: 'Permissions & roles', levels: ['view', 'manage'] },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_AREAS.flatMap((a) =>
  a.levels.map((l) => `${a.area}:${l}`)
);

const ALL_SET = new Set(ALL_PERMISSIONS);

export function isValidPermission(key: string): boolean {
  return ALL_SET.has(key);
}

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

export interface EffectivePermissionInput {
  role: UserRole;
  /** The assigned custom role's permission list (STAFF only). */
  rolePermissions?: string[] | null;
  /** Per-user revoked keys — subtracts from either source. */
  revoked?: string[] | null;
}

/**
 * The permissions a user effectively holds:
 *  - ADMIN  → every permission, minus `revoked`
 *  - STAFF  → their custom role's permissions, minus `revoked`
 *  - others → none
 */
export function effectivePermissions(input: EffectivePermissionInput): Set<string> {
  const base =
    input.role === 'ADMIN'
      ? ALL_PERMISSIONS
      : input.role === 'STAFF'
        ? input.rolePermissions ?? []
        : [];
  const expanded = expandImplied(base);
  for (const r of input.revoked ?? []) {
    expanded.delete(r);
    // Revoking `x:manage` must also drop the implied `x:view` if `view`
    // wasn't granted in its own right by the base list.
    if (r.endsWith(':manage')) {
      const view = `${r.slice(0, -':manage'.length)}:view`;
      if (!base.includes(view)) expanded.delete(view);
    }
  }
  return expanded;
}
