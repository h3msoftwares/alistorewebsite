import { describe, it, expect } from 'vitest';
import { categoryCode, generateProductSku, nameCode } from './sku';

describe('sku generator', () => {
  it('builds ROOT-CATEGORY-NAME-SUFFIX', () => {
    expect(
      generateProductSku({ name: 'Linen Summer Dress', categoryPath: ['Women', 'Tops', 'Dresses'], suffix: '0042' })
    ).toBe('WOM-DRE-LSD-0042');
  });

  it('skips the leaf for a root-only category and falls back to PRD with no usable name', () => {
    expect(generateProductSku({ name: 'Hoodie', categoryPath: ['Kids'], suffix: '1234' })).toBe('KID-HOO-1234');
    expect(generateProductSku({ name: 'فستان', categoryPath: [], suffix: '0001' })).toBe('PRD-0001');
  });

  it('name codes: initials of up to 4 words, topped up to 3 chars, stopwords and accents ignored', () => {
    expect(nameCode('The Classic Oxford Shirt with Pocket')).toBe('COSP');
    expect(nameCode('Silk Scarf')).toBe('SSI');
    expect(nameCode('Café')).toBe('CAF');
  });

  it('category codes are 3 ASCII letters', () => {
    expect(categoryCode('T-Shirts')).toBe('TSH');
    expect(categoryCode('Men')).toBe('MEN');
  });
});
