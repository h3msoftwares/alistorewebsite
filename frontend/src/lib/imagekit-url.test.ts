import { describe, it, expect } from 'vitest';
import { getCardImageUrl, getDetailImageUrl, getImageKitUrl, getThumbnailUrl, getZoomImageUrl } from './imagekit-url';

const URL_ = 'https://ik.imagekit.io/demo/img/product.jpg';

describe('getImageKitUrl', () => {
  it('passes an empty url straight through', () => {
    expect(getImageKitUrl('')).toBe('');
  });

  it('defaults to quality 80 and f-auto with no width/height', () => {
    expect(getImageKitUrl(URL_)).toBe(`${URL_}?tr=q-80,f-auto`);
  });

  it('adds w/h and defaults to cover (no crop-mode param) when both are given', () => {
    expect(getImageKitUrl(URL_, { width: 600, height: 600 })).toBe(`${URL_}?tr=w-600,h-600,q-80,f-auto`);
  });

  it('maps fit: contain to ImageKit\'s c-at_max (fit inside, no crop/pad)', () => {
    expect(getImageKitUrl(URL_, { width: 600, height: 600, fit: 'contain' })).toBe(
      `${URL_}?tr=w-600,h-600,c-at_max,q-80,f-auto`
    );
  });

  it('ignores fit when only one of width/height is given (nothing to crop against)', () => {
    expect(getImageKitUrl(URL_, { width: 600, fit: 'contain' })).toBe(`${URL_}?tr=w-600,q-80,f-auto`);
  });

  it('respects an explicit quality', () => {
    expect(getImageKitUrl(URL_, { width: 300, quality: 60 })).toBe(`${URL_}?tr=w-300,q-60,f-auto`);
  });

  it('rounds fractional widths/heights', () => {
    expect(getImageKitUrl(URL_, { width: 300.6, height: 299.4 })).toBe(`${URL_}?tr=w-301,h-299,q-80,f-auto`);
  });

  it('appends with & instead of ? when the url already has a query string', () => {
    const withQuery = `${URL_}?updatedAt=123`;
    expect(getImageKitUrl(withQuery, { width: 300 })).toBe(`${withQuery}&tr=w-300,q-80,f-auto`);
  });
});

describe('named size variants', () => {
  it('thumbnail is ~300x300', () => {
    expect(getThumbnailUrl(URL_)).toBe(`${URL_}?tr=w-300,h-300,q-80,f-auto`);
  });
  it('card is ~600x600', () => {
    expect(getCardImageUrl(URL_)).toBe(`${URL_}?tr=w-600,h-600,q-80,f-auto`);
  });
  it('detail is ~1200x1200', () => {
    expect(getDetailImageUrl(URL_)).toBe(`${URL_}?tr=w-1200,h-1200,q-80,f-auto`);
  });
  it('zoom is ~2000x2000', () => {
    expect(getZoomImageUrl(URL_)).toBe(`${URL_}?tr=w-2000,h-2000,q-80,f-auto`);
  });
  it('a variant helper still accepts a quality/fit override', () => {
    expect(getThumbnailUrl(URL_, { quality: 50, fit: 'contain' })).toBe(`${URL_}?tr=w-300,h-300,c-at_max,q-50,f-auto`);
  });
});
