import { describe, it, expect } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import type { AuthUser } from '@/lib/types';
import { PERMISSION_AREAS as BACKEND_PERMISSION_AREAS } from '../../../backend/src/lib/permissions';
import {
  ADMIN_SECTIONS,
  ALL_PERMISSION_KEYS,
  PERMISSION_AREAS,
  Can,
  areaLabel,
  expandImplied,
  requiredPermissionForPath,
  usePermissions,
} from './rbac';

describe('permission catalog parity', () => {
  it('mirrors every backend permission area and level, including COD collections', () => {
    const keys = (areas: typeof PERMISSION_AREAS) => areas.flatMap((a) => a.levels.map((l) => `${a.area}:${l}`)).sort();
    expect(keys(PERMISSION_AREAS)).toEqual(keys(BACKEND_PERMISSION_AREAS));
    expect(ALL_PERMISSION_KEYS).toContain('payments:manage');
    expect(ALL_PERMISSION_KEYS).toContain('payments:view');
  });
});

const signedIn = (over: Partial<AuthUser>) => {
  const { Wrapper, store } = createWrapper();
  store.dispatch({
    type: 'auth/authenticated',
    payload: {
      id: 'u1',
      name: 'Ali',
      email: 'a@x.dev',
      phone: null,
      role: 'STAFF',
      ...over,
    } satisfies AuthUser,
  });
  return Wrapper;
};

describe('expandImplied', () => {
  it('adds the implied :view for every :manage and drops unknown keys', () => {
    const out = expandImplied(['orders:manage', 'bogus:manage', 'analytics:view']);
    expect([...out].sort()).toEqual(['analytics:view', 'orders:manage', 'orders:view']);
  });
});

describe('requiredPermissionForPath', () => {
  it('maps admin sub-paths to their section permission (longest prefix wins)', () => {
    expect(requiredPermissionForPath('/en/admin')).toBe('dashboard:view');
    expect(requiredPermissionForPath('/admin')).toBe('dashboard:view');
    expect(requiredPermissionForPath('/ar/admin/orders')).toBe('orders:view');
    expect(requiredPermissionForPath('/en/admin/products/new')).toBe('products:view');
    expect(requiredPermissionForPath('/en/admin/roles')).toBe('roles:view');
  });

  it('returns null for non-admin paths', () => {
    expect(requiredPermissionForPath('/en/account')).toBeNull();
    expect(requiredPermissionForPath('/en/administrator-notes')).toBeNull();
  });

  it('never gates the self-service profile page behind a business permission', () => {
    expect(requiredPermissionForPath('/en/admin/profile')).toBeNull();
    expect(requiredPermissionForPath('/admin/profile')).toBeNull();
  });
});

describe('areaLabel', () => {
  it('localises known areas and falls back to the raw key', () => {
    expect(areaLabel('orders', 'en')).toBe('Orders');
    expect(areaLabel('orders', 'ar')).toBe('الطلبات');
    expect(areaLabel('mystery', 'en')).toBe('mystery');
  });
});

describe('ADMIN_SECTIONS', () => {
  it('every section references a real permission key', () => {
    for (const s of ADMIN_SECTIONS) {
      expect(ALL_PERMISSION_KEYS).toContain(s.permission);
    }
  });
});

describe('usePermissions', () => {
  it('expands manage⇒view and answers has / hasAny', () => {
    const { result } = renderHook(() => usePermissions(), {
      wrapper: signedIn({ role: 'STAFF', permissions: ['orders:manage'] }),
    });
    expect(result.current.has('orders:view')).toBe(true);
    expect(result.current.has('orders:manage')).toBe(true);
    expect(result.current.has('products:view')).toBe(false);
    expect(result.current.hasAny('products:view', 'orders:view')).toBe(true);
    expect(result.current.isFullAdmin).toBe(false);
  });

  it('flags a full admin', () => {
    const { result } = renderHook(() => usePermissions(), {
      wrapper: signedIn({ role: 'ADMIN', permissions: [...ALL_PERMISSION_KEYS] }),
    });
    expect(result.current.isFullAdmin).toBe(true);
    expect(result.current.has('settings:manage')).toBe(true);
  });
});

describe('<Can>', () => {
  it('renders children only when the permission is held', () => {
    render(
      <>
        <Can permission="orders:view">
          <span>orders</span>
        </Can>
        <Can permission="settings:manage" fallback={<span>no-settings</span>}>
          <span>settings</span>
        </Can>
      </>,
      { wrapper: signedIn({ role: 'STAFF', permissions: ['orders:view'] }) }
    );
    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.queryByText('settings')).not.toBeInTheDocument();
    expect(screen.getByText('no-settings')).toBeInTheDocument();
  });
});
