import { describe, it, expect } from 'vitest';
import {
  colorNameToCss,
  getColorOptions,
  getSizeOptions,
  hasColorAxis,
  hasSizeAxis,
  isOptionOutOfStock,
  resolveVariant,
} from './product-variants';
import type { ProductVariant } from './types';

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 'v',
    productID: 'p',
    sku: 'sku',
    size: null,
    color: null,
    stockQuantity: 5,
    ...overrides,
  };
}

describe('axis detection', () => {
  it('detects a size axis when any variant has a size', () => {
    expect(hasSizeAxis([variant({ size: 'M' }), variant()])).toBe(true);
    expect(hasSizeAxis([variant(), variant()])).toBe(false);
  });

  it('detects a colour axis the same way', () => {
    expect(hasColorAxis([variant({ color: 'Navy' })])).toBe(true);
    expect(hasColorAxis([variant()])).toBe(false);
  });
});

describe('option lists', () => {
  it('returns distinct sizes/colours in first-seen order', () => {
    const variants = [
      variant({ id: '1', size: 'M', color: 'Black' }),
      variant({ id: '2', size: 'S', color: 'Black' }),
      variant({ id: '3', size: 'M', color: 'Beige' }),
    ];
    expect(getSizeOptions(variants)).toEqual(['M', 'S']);
    expect(getColorOptions(variants)).toEqual(['Black', 'Beige']);
  });
});

describe('resolveVariant', () => {
  const both = [
    variant({ id: '1', size: 'S', color: 'Black', stockQuantity: 0 }),
    variant({ id: '2', size: 'M', color: 'Black', stockQuantity: 3 }),
    variant({ id: '3', size: 'S', color: 'Beige', stockQuantity: 2 }),
  ];

  it('requires every axis the product actually has before resolving', () => {
    expect(resolveVariant(both, { size: null, color: null })).toBeUndefined();
    expect(resolveVariant(both, { size: 'M', color: null })).toBeUndefined();
    expect(resolveVariant(both, { size: null, color: 'Black' })).toBeUndefined();
  });

  it('resolves the exact variant once both axes are chosen', () => {
    expect(resolveVariant(both, { size: 'M', color: 'Black' })?.id).toBe('2');
    expect(resolveVariant(both, { size: 'S', color: 'Beige' })?.id).toBe('3');
  });

  it('ignores axes the product does not use', () => {
    const sizeOnly = [variant({ id: '1', size: 'M', stockQuantity: 4 })];
    expect(resolveVariant(sizeOnly, { size: 'M', color: 'irrelevant' })?.id).toBe('1');
  });

  it('auto-resolves a single one-size/no-colour variant with no selection', () => {
    const single = [variant({ id: '1' })];
    expect(resolveVariant(single, { size: null, color: null })?.id).toBe('1');
  });
});

describe('isOptionOutOfStock', () => {
  const variants = [
    variant({ id: '1', size: 'S', color: 'Black', stockQuantity: 0 }),
    variant({ id: '2', size: 'M', color: 'Black', stockQuantity: 3 }),
    variant({ id: '3', size: 'S', color: 'Beige', stockQuantity: 2 }),
  ];

  it('is out of stock when every matching variant has zero stock', () => {
    expect(isOptionOutOfStock(variants, 'size', 'S', 'Black')).toBe(true);
  });

  it('is not out of stock when at least one matching combination has stock', () => {
    expect(isOptionOutOfStock(variants, 'size', 'S', 'Beige')).toBe(false);
    expect(isOptionOutOfStock(variants, 'size', 'S', null)).toBe(false); // S/Beige still has stock
  });

  it('is out of stock when the combination does not exist at all', () => {
    expect(isOptionOutOfStock(variants, 'size', 'M', 'Beige')).toBe(true);
  });
});

describe('colorNameToCss', () => {
  it('lowercases and strips spaces from colour names', () => {
    expect(colorNameToCss('Navy')).toBe('navy');
    expect(colorNameToCss('Light Blue')).toBe('lightblue');
  });

  it('passes non-CSS-keyword names through unchanged in shape (caller-safe even if it will not paint)', () => {
    expect(colorNameToCss('Assorted')).toBe('assorted');
    expect(colorNameToCss('Rose')).toBe('rose');
  });
});
