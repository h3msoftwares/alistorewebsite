import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { Topbar, initialsOf } from './topbar';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/en' }));

const auth = { user: null as { name: string } | null, isAuthenticated: false };
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-catalog', () => ({ useNavCollections: () => ({ data: [], isPending: false }) }));
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => ({ data: null }) }));
vi.mock('./search-overlay', () => ({ SearchOverlay: () => null }));
vi.mock('./cart-drawer', () => ({ CartDrawer: () => null }));
vi.mock('./favourites-drawer', () => ({ FavouritesDrawer: () => null }));
vi.mock('./logout-button', () => ({ LogoutButton: () => <span>logout</span> }));

const renderBar = () => {
  const { Wrapper } = createWrapper();
  return render(<Topbar locale="en" />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.isAuthenticated = false;
});

describe('initialsOf', () => {
  it('two words → first + last initial, uppercased', () => {
    expect(initialsOf('Mohammad Ali')).toBe('MA');
    expect(initialsOf('  jane   q   doe ')).toBe('JD');
  });
  it('one word → first two letters', () => {
    expect(initialsOf('cher')).toBe('CH');
  });
  it('empty / nullish → ""', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf(null)).toBe('');
    expect(initialsOf(undefined)).toBe('');
  });
});

describe('<Topbar> account action', () => {
  it('signed out: shows a "Log in" link, no avatar', () => {
    renderBar();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/en/login');
    expect(document.querySelector('.topbar__avatar')).toBeNull();
  });

  it('signed in: shows an initials avatar linking to /account, no "Log in" text', () => {
    auth.user = { name: 'Mohammad Ali' };
    auth.isAuthenticated = true;
    renderBar();

    const avatar = document.querySelector('.topbar__avatar');
    expect(avatar).toHaveTextContent('MA');
    expect(avatar?.closest('a')).toHaveAttribute('href', '/en/account');
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
  });
});
