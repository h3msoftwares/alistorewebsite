import { describe, it, expect } from 'vitest';
import { buildCategoryPaths } from './category-path';
import type { Category } from './types';

function cat(over: Partial<Category> & Pick<Category, 'id' | 'nameEn' | 'nameAr'>): Category {
  return {
    slug: over.id,
    isActive: true,
    showOnHome: false,
    sortOrder: 0,
    homeSortOrder: 0,
    showInNav: false,
    showOnHomeAsImage: false,
    path: `/${over.id}/`,
    depth: 0,
    images: [],
    ...over,
  };
}

describe('buildCategoryPaths', () => {
  it('a root category has an empty path (no ancestors)', () => {
    const categories = [cat({ id: 'women', nameEn: 'Women', nameAr: 'نساء' })];
    const paths = buildCategoryPaths(categories, false);
    expect(paths.get('women')).toBe('');
  });

  it('builds a nested breadcrumb from ancestor names only, not including its own name', () => {
    const categories = [
      cat({ id: 'women', nameEn: 'Women', nameAr: 'نساء' }),
      cat({ id: 'shoes', nameEn: 'Shoes', nameAr: 'أحذية', parentID: 'women' }),
      cat({ id: 'sport', nameEn: 'Sport Shoes', nameAr: 'أحذية رياضية', parentID: 'shoes' }),
    ];
    const paths = buildCategoryPaths(categories, false);
    expect(paths.get('shoes')).toBe('Women');
    expect(paths.get('sport')).toBe('Women › Shoes');
  });

  it('tells apart two same-named categories living under different roots', () => {
    const categories = [
      cat({ id: 'women', nameEn: 'Women', nameAr: 'نساء' }),
      cat({ id: 'men', nameEn: 'Men', nameAr: 'رجال' }),
      cat({ id: 'women-shoes', nameEn: 'Shoes', nameAr: 'أحذية', parentID: 'women' }),
      cat({ id: 'men-shoes', nameEn: 'Shoes', nameAr: 'أحذية', parentID: 'men' }),
    ];
    const paths = buildCategoryPaths(categories, false);
    expect(paths.get('women-shoes')).toBe('Women');
    expect(paths.get('men-shoes')).toBe('Men');
    expect(paths.get('women-shoes')).not.toBe(paths.get('men-shoes'));
  });

  it('uses the Arabic separator and names when isAr is true', () => {
    const categories = [
      cat({ id: 'women', nameEn: 'Women', nameAr: 'نساء' }),
      cat({ id: 'shoes', nameEn: 'Shoes', nameAr: 'أحذية', parentID: 'women' }),
    ];
    const paths = buildCategoryPaths(categories, true);
    expect(paths.get('shoes')).toBe('نساء');
  });
});
