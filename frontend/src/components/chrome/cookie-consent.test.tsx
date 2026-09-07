import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookieConsent } from './cookie-consent';
import {
  clearConsentChoice,
  getConsentChoice,
  hasConsent,
  openConsentSettings,
  setConsentChoice,
} from '@/lib/consent';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

beforeEach(() => {
  window.localStorage.clear();
  // reset the module-level "settings open" flag
  setConsentChoice('necessary');
  clearConsentChoice();
});

describe('<CookieConsent>', () => {
  it('shows on a first visit with both choices and a privacy link', () => {
    render(<CookieConsent locale="en" />);

    expect(screen.getByRole('button', { name: 'Accept All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Necessary Only' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/en/privacy',
    );
  });

  it('"Accept All" stores the choice, grants analytics, and hides the banner', async () => {
    const user = userEvent.setup();
    render(<CookieConsent locale="en" />);

    await user.click(screen.getByRole('button', { name: 'Accept All' }));

    expect(getConsentChoice()).toBe('all');
    expect(hasConsent('analytics')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Accept All' })).not.toBeInTheDocument();
  });

  it('"Necessary Only" stores the choice, grants nothing optional, and hides the banner', async () => {
    const user = userEvent.setup();
    render(<CookieConsent locale="en" />);

    await user.click(screen.getByRole('button', { name: 'Necessary Only' }));

    expect(getConsentChoice()).toBe('necessary');
    expect(hasConsent('analytics')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Necessary Only' })).not.toBeInTheDocument();
  });

  it('stays hidden when a choice already exists', () => {
    setConsentChoice('all');
    render(<CookieConsent locale="en" />);
    expect(screen.queryByRole('button', { name: 'Accept All' })).not.toBeInTheDocument();
  });

  it('re-appears when the footer re-opens preferences, then dismisses again', async () => {
    const user = userEvent.setup();
    setConsentChoice('necessary');
    render(<CookieConsent locale="en" />);
    expect(screen.queryByRole('button', { name: 'Accept All' })).not.toBeInTheDocument();

    act(() => openConsentSettings());
    expect(screen.getByRole('button', { name: 'Accept All' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept All' }));
    expect(getConsentChoice()).toBe('all');
    expect(screen.queryByRole('button', { name: 'Accept All' })).not.toBeInTheDocument();
  });

  it('renders Arabic labels for the ar locale', () => {
    render(<CookieConsent locale="ar" />);
    expect(screen.getByRole('button', { name: 'قبول الكل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'الضرورية فقط' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'سياسة الخصوصية' })).toHaveAttribute('href', '/ar/privacy');
  });
});
