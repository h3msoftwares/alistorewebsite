import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createWrapper } from '@/test/utils';
import { SiteFooter } from './site-footer';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

const auth = { isAuthenticated: false };
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => auth }));
vi.mock('@/hooks/use-catalog', () => ({ useNavCategories: () => ({ data: [], isPending: false }) }));
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => ({ data: null }) }));

const renderFooter = () => {
  const { Wrapper } = createWrapper();
  return render(<SiteFooter locale="en" />, { wrapper: Wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.isAuthenticated = false;
});

describe('<SiteFooter> — Join / register teaser', () => {
  it('a guest sees the Join form; submitting it goes to /register with the typed email', async () => {
    const user = userEvent.setup();
    renderFooter();

    await user.type(screen.getByRole('textbox', { name: /create an account/i }), 'new@shopper.test');
    await user.click(screen.getByRole('button', { name: /join/i }));

    expect(push).toHaveBeenCalledWith('/en/register?email=new%40shopper.test');
  });

  it('submitting with no email still goes to /register (no query)', async () => {
    const user = userEvent.setup();
    renderFooter();
    await user.click(screen.getByRole('button', { name: /join/i }));
    expect(push).toHaveBeenCalledWith('/en/register');
  });

  it('a signed-in user does not see the Join form at all', () => {
    auth.isAuthenticated = true;
    renderFooter();
    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /create an account/i })).not.toBeInTheDocument();
  });
});

describe('<SiteFooter> — developer credit', () => {
  it('credits H3M Softwares with a mailto and tel link', () => {
    renderFooter();
    expect(screen.getByText('H3M Softwares')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'h3msoftwares@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:h3msoftwares@gmail.com'
    );
    expect(screen.getByRole('link', { name: '+961 81 076 393' })).toHaveAttribute(
      'href',
      'tel:+96181076393'
    );
  });
});
