import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper, makeAuthedStore } from '@/test/utils';
import { AdminSidebar } from './admin-sidebar';
import { AdminMobileNav } from './admin-mobile-nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/en/admin/orders' }));
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => ({ data: null }) }));
vi.mock('@/hooks/use-orders', () => ({ useAdminDashboard: () => ({ data: null }) }));
vi.mock('@/components/chrome/logout-button', () => ({ LogoutButton: () => null }));
vi.mock('@/components/chrome/topbar', () => ({ initialsOf: () => 'ST' }));

describe('Returns navigation', () => {
  it.each([false, true])('desktop sidebar requires returns:view (granted=%s)', granted => {
    const permissions = ['orders:view', ...(granted ? ['returns:view'] : [])];
    const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions }));
    render(<AdminSidebar locale="en" onCollapse={() => {}} />, { wrapper: Wrapper });
    expect(Boolean(screen.queryByRole('link', { name: 'Returns' }))).toBe(granted);
    expect(screen.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
  });
  it.each([false, true])('mobile drawer requires returns:view (granted=%s)', async granted => {
    const permissions = ['dashboard:view', 'orders:view', 'products:view', ...(granted ? ['returns:view'] : [])];
    const { Wrapper } = createWrapper(makeAuthedStore({ role: 'STAFF', permissions }));
    render(<AdminMobileNav locale="en" />, { wrapper: Wrapper });
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: 'More' }));
    const drawer = within(screen.getByRole('dialog', { name: 'Menu' }));
    expect(Boolean(drawer.queryByRole('link', { name: 'Returns' }))).toBe(granted);
    expect(drawer.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
  });
});
