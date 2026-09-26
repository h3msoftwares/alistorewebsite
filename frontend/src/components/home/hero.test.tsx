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
  // Every case here is a Category page (/{locale}/category/{slug}) —
  // heroCtaCategory was migrated off Collection (which lived at a different
  // route, /{locale}/{slug}) specifically because an admin picking "Men"
  // meant the Men Category, not some separate same-named Collection record;
  // reusing the Collection route shape for it sent visitors to the wrong
  // page. See schema.prisma's comment on heroCtaCategoryID.
  it('links to /category/<slug> when no admin CTA category is set, following the first nav category', () => {
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

  it('links to /category/<slug> for the admin-picked category, overriding the nav fallback', () => {
    settings.data = {
      heroEyebrowEn: 'Limited stock',
      heroHeadlineEn: 'Buy it before someone else does.',
      heroLedeEn: 'Women, men and kids.',
      heroCtaLabelEn: 'Discover',
      heroCtaCategory: { id: 'cat1', slug: 'kids-pajamas', nameEn: "Kids' Pajamas", nameAr: 'بيجامات أطفال' },
    };
    navCategories.data = [{ id: 'c1', slug: 'men', showInNav: true, sortOrder: 0 }];
    renderHero();
    expect(screen.getByRole('link', { name: /discover/i })).toHaveAttribute('href', '/en/category/kids-pajamas');
  });
});
