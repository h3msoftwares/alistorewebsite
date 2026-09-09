import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CollectionBanner } from './collection-banner';
import type { Collection } from '@/lib/types';

vi.mock('@/hooks/use-reveal', () => ({ useReveal: () => [{ current: null }, '', {}] }));

const base: Collection = {
  id: 'c1',
  nameEn: 'Kids',
  nameAr: 'أطفال',
  slug: 'kids',
  descriptionEn: 'Playful, practical, built to last.',
  descriptionAr: 'مرحة وعملية ومصنوعة لتدوم.',
  isActive: true,
  showInNav: true,
  showOnHome: false,
  showOnHomeAsImage: true,
  sortOrder: 3,
  accentColor: '#b4611e',
  images: [{ id: 'i1', collectionID: 'c1', url: 'https://ik.imagekit.io/demo/kids.jpg', sortOrder: 0 }],
};

describe('<CollectionBanner>', () => {
  it('renders the description, an accent-coloured panel and a CTA linking to the collection', () => {
    render(<CollectionBanner locale="en" collection={base} />);
    expect(screen.getByRole('heading', { name: 'Playful, practical, built to last.' })).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Shop Kids' });
    expect(cta).toHaveAttribute('href', '/en/kids');
  });

  it('uses the custom CTA label and Arabic fields in the ar locale', () => {
    render(
      <CollectionBanner
        locale="ar"
        collection={{ ...base, homeImageCtaAr: 'اكتشف مجموعة الأطفال' }}
      />
    );
    expect(screen.getByRole('link', { name: 'اكتشف مجموعة الأطفال' })).toHaveAttribute('href', '/ar/kids');
    expect(screen.getByRole('heading', { name: 'مرحة وعملية ومصنوعة لتدوم.' })).toBeInTheDocument();
  });

  it('falls back to the collection name when there is no description', () => {
    render(<CollectionBanner locale="en" collection={{ ...base, descriptionEn: null, descriptionAr: null }} />);
    expect(screen.getByRole('heading', { name: 'Kids' })).toBeInTheDocument();
  });
});
