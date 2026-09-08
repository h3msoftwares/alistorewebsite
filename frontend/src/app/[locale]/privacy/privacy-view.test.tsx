import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { PrivacyView } from './privacy-view';

const settings: { data: unknown } = { data: null };
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => settings }));

function renderView(locale: 'en' | 'ar' = 'en') {
  const { Wrapper } = createWrapper();
  return render(<PrivacyView locale={locale} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.data = null;
});

describe('<PrivacyView>', () => {
  it('renders the English policy with the brand name and the document sections', () => {
    settings.data = { brandNameEn: 'Rima Boutique' };
    renderView('en');
    expect(
      screen.getByRole('heading', { level: 1, name: /Privacy Policy — Rima Boutique/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1. Information We Collect' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '9. Contact Us' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '10. Changes to This Policy' })).toBeInTheDocument();
  });

  it('wires the admin contact email and phone into Section 9', () => {
    settings.data = {
      brandNameEn: "Ali's Store",
      contactEmail: 'privacy@alistore.test',
      contactPhone: '+961 71 234 567',
    };
    renderView('en');
    expect(screen.getByRole('link', { name: 'privacy@alistore.test' })).toHaveAttribute(
      'href',
      'mailto:privacy@alistore.test'
    );
    expect(screen.getByRole('link', { name: '+961 71 234 567' })).toHaveAttribute(
      'href',
      'tel:+96171234567'
    );
  });

  it('omits the email/phone lines and shows the footer fallback when unset', () => {
    settings.data = { brandNameEn: "Ali's Store" };
    renderView('en');
    expect(screen.queryByText(/^Email:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Phone:/)).not.toBeInTheDocument();
    expect(screen.getByText(/see the site footer/i)).toBeInTheDocument();
  });

  it('uses the admin Instagram URL when set, else the default handle link', () => {
    settings.data = { brandNameEn: "Ali's Store", instagramUrl: 'https://instagram.com/rima' };
    const { unmount } = renderView('en');
    expect(screen.getByRole('link', { name: '@as_alistore' })).toHaveAttribute(
      'href',
      'https://instagram.com/rima'
    );
    unmount();

    settings.data = { brandNameEn: "Ali's Store" };
    renderView('en');
    expect(screen.getByRole('link', { name: '@as_alistore' })).toHaveAttribute(
      'href',
      'https://instagram.com/as_alistore'
    );
  });

  it('renders the Arabic policy for locale "ar"', () => {
    settings.data = { brandNameAr: 'متجر ريما' };
    renderView('ar');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('سياسة الخصوصية — متجر ريما');
    expect(screen.getByRole('heading', { name: '٩. تواصل معنا' })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('dir', 'rtl');
  });
});
