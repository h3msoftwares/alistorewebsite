import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CollectionBanner } from './collection-banner';
import type { Category } from '@/lib/types';

vi.mock('@/hooks/use-reveal', () => ({ useReveal: () => [{ current: null }, '', {}] }));

// CollectionBanner renders a top-level Category now (Stage 1 catalog
// redesign — Women/Men/Kids moved from Collection to Category, see the
// implementation plan's nav/banner decision). Named for its pre-Stage-1 role.
const base: Category = {
  id: 'c1',
  parentID: null,
  nameEn: 'Kids',
  nameAr: 'أطفال',
  slug: 'kids',
  descriptionEn: 'Playful, practical, built to last.',
  descriptionAr: 'مرحة وعملية ومصنوعة لتدوم.',
  isActive: true,
  showOnHome: false,
  sortOrder: 3,
  homeSortOrder: 3,
  showInNav: true,
  showOnHomeAsImage: true,
  accentColor: '#b4611e',
  path: '/kids/',
  depth: 0,
  images: [{ id: 'i1', categoryID: 'c1', url: 'https://ik.imagekit.io/demo/kids.jpg', sortOrder: 0 }],
};

describe('<CollectionBanner>', () => {
  it('renders the description, an accent-coloured panel and a CTA linking to the category', () => {
    render(<CollectionBanner locale="en" collection={base} />);
    expect(screen.getByRole('heading', { name: 'Playful, practical, built to last.' })).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Shop Kids' });
    expect(cta).toHaveAttribute('href', '/en/category/kids');
  });

  it('uses the custom CTA label and Arabic fields in the ar locale', () => {
    render(
      <CollectionBanner
        locale="ar"
        collection={{ ...base, homeImageCtaAr: 'اكتشف مجموعة الأطفال' }}
      />
    );
    expect(screen.getByRole('link', { name: 'اكتشف مجموعة الأطفال' })).toHaveAttribute('href', '/ar/category/kids');
    expect(screen.getByRole('heading', { name: 'مرحة وعملية ومصنوعة لتدوم.' })).toBeInTheDocument();
  });

  it('falls back to the category name when there is no description', () => {
    render(<CollectionBanner locale="en" collection={{ ...base, descriptionEn: null, descriptionAr: null }} />);
    expect(screen.getByRole('heading', { name: 'Kids' })).toBeInTheDocument();
  });
});
