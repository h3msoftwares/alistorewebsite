import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeAuthedStore } from '@/test/utils';
import { AdminSidebar } from './admin-sidebar';
import { AdminMobileNav } from './admin-mobile-nav';
import { areaLabel, requiredPermissionForPath } from '@/lib/rbac';

vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/bundles' }));
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => ({ data: null }) }));
vi.mock('@/hooks/use-orders', () => ({ useAdminDashboard: () => ({ data: null }) }));
vi.mock('@/components/chrome/logout-button', () => ({ LogoutButton: () => null }));
vi.mock('@/components/chrome/topbar', () => ({ initialsOf: () => 'ST' }));

describe('Bundle navigation and volume pricing labels', () => {
  it.each([false, true])('desktop Bundle link requires bundles:view (%s)', (granted) => {
    const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions: ['combos:view', ...(granted ? ['bundles:view'] : [])] }));
    render(<AdminSidebar locale="en" onCollapse={() => {}} />, { wrapper: Wrapper });
    expect(Boolean(screen.queryByRole('link', { name: 'Bundle' }))).toBe(granted);
    expect(screen.getByRole('link', { name: 'Volume pricing' })).toHaveAttribute('href', '/en/admin/combos');
    expect(screen.queryByRole('link', { name: /Combo/ })).not.toBeInTheDocument();
  });
  it.each([false, true])('mobile Bundle link requires bundles:view (%s)', async (granted) => {
    const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions: ['combos:view', ...(granted ? ['bundles:view'] : [])] }));
    render(<AdminMobileNav locale="en" />, { wrapper: Wrapper });
    await userEvent.setup().click(screen.getByRole('button', { name: 'More' }));
    expect(Boolean(within(screen.getByRole('dialog')).queryByRole('link', { name: 'Bundle' }))).toBe(granted);
  });
  it('labels both permission matrices bilingually while retaining combos identifiers', () => {
    expect(areaLabel('combos', 'en')).toBe('Volume pricing');
    expect(areaLabel('combos', 'ar')).toBe('التسعير حسب الكمية');
    expect(areaLabel('bundles', 'en')).toBe('Bundle');
    expect(areaLabel('bundles', 'ar')).toBe('باقة');
    expect(requiredPermissionForPath('/en/admin/combos/new')).toBe('combos:view');
    expect(requiredPermissionForPath('/ar/admin/bundles/new')).toBe('bundles:view');
    expect(requiredPermissionForPath('/en/admin/bundles/123')).toBe('bundles:view');
  });
});
