import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { Hero } from './hero';

const settings: { data: unknown } = { data: null };
const navCategories: { data: unknown } = { data: undefined };
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => settings }));
vi.mock('@/hooks/use-catalog', () => ({ useNavCategories: () => navCategories }));

function renderHero(locale = 'en') {
  const { Wrapper } = createWrapper();
  return render(<Hero locale={locale} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.data = null;
  navCategories.data = undefined;
});

describe('<Hero>', () => {
  // Two different route shapes: a Collection page lives at /{locale}/{slug},
  // a Category page at /{locale}/category/{slug} — see hero.tsx's doc
  // comment. Confirmed live bug: the fallback used to reuse the Collection
  // URL shape for a Category slug, sending visitors to the wrong page.
  it('links to /category/<slug> when no admin CTA collection is set, following the first nav category', () => {
    settings.data = null;
    navCategories.data = [{ id: 'c1', slug: 'men', showInNav: true, sortOrder: 0 }];
    renderHero();
    expect(screen.getByRole('link', { name: /discover/i })).toHaveAttribute('href', '/en/category/men');
  });

  it('falls back to /category/women when neither settings nor nav categories have loaded yet', () => {
    settings.data = null;
    navCategories.data = undefined;
    renderHero();
    expect(screen.getByRole('link', { name: /discover/i })).toHaveAttribute('href', '/en/category/women');
  });

  it('links to /{slug} (no /category/ prefix) when the admin explicitly picked a real Collection', () => {
    settings.data = {
      heroEyebrowEn: 'Limited stock',
      heroHeadlineEn: 'Buy it before someone else does.',
      heroLedeEn: 'Women, men and kids.',
      heroCtaLabelEn: 'Discover',
      heroCtaCollection: { id: 'col1', slug: 'summer-picks', nameEn: 'Summer picks', nameAr: 'اختيارات الصيف' },
    };
    navCategories.data = [{ id: 'c1', slug: 'men', showInNav: true, sortOrder: 0 }];
    renderHero();
    expect(screen.getByRole('link', { name: /discover/i })).toHaveAttribute('href', '/en/summer-picks');
  });
});
