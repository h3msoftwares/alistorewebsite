import { describe, it, expect } from 'vitest';
import { accentStyle, luminance } from './collections';

describe('luminance', () => {
  it('is ~0 for black and ~1 for white', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('accentStyle', () => {
  it('returns {} for a null / empty hex so the element inherits :root', () => {
    expect(accentStyle(null)).toEqual({});
    expect(accentStyle(undefined)).toEqual({});
    expect(accentStyle('')).toEqual({});
  });

  it('sets the three custom properties and picks white ink on a dark accent', () => {
    const style = accentStyle('#a65a7e') as Record<string, string>;
    expect(style['--collection-accent']).toBe('#a65a7e');
    expect(style['--collection-accent-soft']).toBe('color-mix(in srgb, #a65a7e 12%, white)');
    expect(style['--collection-on-accent']).toBe('#ffffff');
  });

  it('picks dark ink on a light accent', () => {
    const style = accentStyle('#f6e9f0') as Record<string, string>;
    expect(style['--collection-on-accent']).toBe('#1c1917');
  });
});
