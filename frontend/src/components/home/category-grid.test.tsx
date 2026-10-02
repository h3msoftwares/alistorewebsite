import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryGrid } from './category-grid';
import type { HomeGrid, HomeGridCategory } from '@/lib/types';

vi.mock('@/hooks/use-reveal', () => ({ useReveal: () => [{ current: null }, '', {}] }));

const cat = (id: string, nameEn: string, over: Partial<HomeGridCategory> = {}): HomeGridCategory => ({
  id,
  slug: nameEn.toLowerCase(),
  nameEn,
  nameAr: `${nameEn}-ar`,
  isActive: true,
  hidden: false,
  images: [{ id: `img-${id}`, categoryID: id, url: `https://ik.imagekit.io/demo/${id}.jpg`, sortOrder: 0 }],
  ...over,
});

const grid = (cats: HomeGridCategory[], over: Partial<HomeGrid> = {}): HomeGrid => ({
  id: 'g1',
  isActive: true,
  sortOrder: 10,
  titleEn: 'Shop by style',
  titleAr: null,
  items: cats.map((c, i) => ({ categoryID: c.id, sortOrder: i, category: c })),
  ...over,
});

describe('<CategoryGrid>', () => {
  it('renders each category as a photo tile with its name, linking to its page, in order — no grid title', () => {
    render(<CategoryGrid locale="en" grid={grid([cat('a', 'Dresses'), cat('b', 'Shoes')])} />);
    expect(screen.queryByText('Shop by style')).toBeNull();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/en/category/dresses', '/en/category/shoes']);
    expect(links[0]).toHaveTextContent('Dresses');
    expect(links[0].querySelector('img')).not.toBeNull();
  });

  it('skips hidden categories and renders nothing with fewer than 2 left', () => {
    const { container } = render(
      <CategoryGrid locale="en" grid={grid([cat('a', 'Dresses'), cat('b', 'Shoes', { hidden: true })])} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('uses Arabic names in the ar locale', () => {
    render(<CategoryGrid locale="ar" grid={grid([cat('a', 'Dresses'), cat('b', 'Shoes')])} />);
    expect(screen.getAllByRole('link')[1]).toHaveTextContent('Shoes-ar');
  });
});
