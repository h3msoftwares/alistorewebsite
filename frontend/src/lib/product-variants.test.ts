import { describe, it, expect } from 'vitest';
import {
  colorNameLabel,
  colorNameToCss,
  firstPurchasableVariant,
  getColorOptions,
  getSizeOptions,
  hasColorAxis,
  hasSizeAxis,
  hexColorLabel,
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
  it('resolves a curated colour name to its real CSS value, case/whitespace-insensitively', () => {
    expect(colorNameToCss('Navy')).toBe('#190066');
    expect(colorNameToCss('navy')).toBe('#190066');
    expect(colorNameToCss('Light Blue')).toBe('#add8e6');
    expect(colorNameToCss('  light   blue ')).toBe('#add8e6');
  });

  it('falls back to the old strip-spaces heuristic for a name outside the curated map', () => {
    // Not in the curated map, but collapses to a real CSS keyword.
    expect(colorNameToCss('SeaGreen')).toBe('seagreen');
  });

  it('passes a truly unknown name through unchanged in shape (caller-safe even if it will not paint)', () => {
    expect(colorNameToCss('Ali Blue')).toBe('aliblue');
  });
});

describe('colorNameLabel', () => {
  it('returns the raw name unchanged for the English locale', () => {
    expect(colorNameLabel('Navy', 'en')).toBe('Navy');
    expect(colorNameLabel('Assorted', 'en')).toBe('Assorted');
  });

  it('translates a curated colour name to Arabic', () => {
    expect(colorNameLabel('Navy', 'ar')).toBe('كحلي');
    expect(colorNameLabel('Light Blue', 'ar')).toBe('أزرق فاتح');
    expect(colorNameLabel('navy', 'ar')).toBe('كحلي'); // case-insensitive
  });

  it('falls back to the raw name in Arabic for a name outside the curated map', () => {
    expect(colorNameLabel('Ali Blue', 'ar')).toBe('Ali Blue');
  });
});

describe('hexColorLabel', () => {
  it('pairs an exact curated hex with its English/Arabic name', () => {
    expect(hexColorLabel('#190066', 'en')).toBe('Navy (#190066)');
    expect(hexColorLabel('#190066', 'ar')).toBe('كحلي (#190066)');
  });

  it('is case-insensitive and pairs the closest curated colour for a near-miss hex', () => {
    expect(hexColorLabel('#180065', 'en')).toBe('Navy (#180065)');
    expect(hexColorLabel('#000001', 'en')).toBe('Black (#000001)');
  });

  it('falls back to the bare uppercased value for anything that is not 6-digit hex', () => {
    expect(hexColorLabel('not-a-colour', 'en')).toBe('NOT-A-COLOUR');
    expect(hexColorLabel('', 'en')).toBe('');
  });
});

describe('firstPurchasableVariant', () => {
  it('returns the first variant that has stock', () => {
    const picked = firstPurchasableVariant([
      variant({ id: 'a', stockQuantity: 0 }),
      variant({ id: 'b', stockQuantity: 4 }),
      variant({ id: 'c', stockQuantity: 9 }),
    ]);
    expect(picked?.id).toBe('b');
  });

  it('falls back to the first variant when none are in stock', () => {
    const picked = firstPurchasableVariant([
      variant({ id: 'a', stockQuantity: 0 }),
      variant({ id: 'b', stockQuantity: 0 }),
    ]);
    expect(picked?.id).toBe('a');
  });

  it('is undefined for a product with no variants', () => {
    expect(firstPurchasableVariant([])).toBeUndefined();
  });
});
