import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { Hero } from './hero';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: Record<string, unknown>) => <img src={src as string} alt={alt as string} />,
}));

const auth = { user: null as { name: string } | null, isAuthenticated: false };
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => ({ data: null }) }));
vi.mock('@/hooks/use-catalog', () => ({ useNavCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/use-reveal', () => ({ useReveal: () => [{ current: null }, '', undefined] }));

const renderHero = () => {
  const { Wrapper } = createWrapper();
  return render(<Hero locale="en" />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.isAuthenticated = false;
});

describe('<Hero> welcome line', () => {
  it('greets a signed-in user by their full name', () => {
    auth.user = { name: 'Hussein Kteish' };
    auth.isAuthenticated = true;
    renderHero();
    expect(screen.getByText('Welcome, Hussein Kteish')).toBeInTheDocument();
  });

  it('shows nothing for a signed-out visitor', () => {
    renderHero();
    expect(screen.queryByText(/^Welcome,/)).not.toBeInTheDocument();
  });
});
