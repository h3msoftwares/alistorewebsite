export type ImageKitFit = 'contain' | 'cover';

export interface ImageKitTransformOptions {
  width?: number;
  height?: number;
  /** 1-100. Defaults to 80 — ImageKit's own recommended balance of size vs quality. */
  quality?: number;
  fit?: ImageKitFit;
}

/**
 * Named "logical" sizes used throughout the app instead of one-off pixel
 * numbers, so a product photo requested for a thumbnail, a grid card, the
 * detail page, or a zoom view always asks ImageKit for one of a few
 * well-known sizes (better CDN cache-hit rate across users/pages).
 */
export const IMAGE_VARIANTS = {
  thumbnail: { width: 300, height: 300 },
  card: { width: 600, height: 600 },
  detail: { width: 1200, height: 1200 },
  zoom: { width: 2000, height: 2000 },
} satisfies Record<string, { width: number; height: number }>;
export type ImageVariant = keyof typeof IMAGE_VARIANTS;

/**
 * Builds an ImageKit transformation URL from a stored full image URL. This
 * (and ImageKit's CDN) owns pixel SIZE/FORMAT/QUALITY; CSS (`aspect-ratio` +
 * `object-fit` on the container) owns visual LAYOUT — the two are
 * deliberately not conflated here:
 *
 * - `fit: 'contain'` → `c-at_max`: ImageKit scales the whole image down to
 *   fit inside width×height, preserving its aspect ratio, with no crop or
 *   pad. Pair with a CSS `object-fit: contain` box — ImageKit only needs to
 *   cap the pixel dimensions/bytes actually sent; the browser still
 *   letterboxes it.
 * - `fit: 'cover'` (default) → no crop-mode param: ImageKit's own default
 *   behaviour when both dimensions are given is to crop-to-fill while
 *   maintaining aspect ratio. Pair with a CSS `object-fit: cover` box.
 *
 * `next/image`'s `fill` mode (used at most call sites in this app) never
 * passes a `height` to its loader (see imagekit-loader.ts), so for those
 * this reduces to a plain width+quality resize — cropping there is entirely
 * the browser's CSS job. `fit`/`height` matter for the direct, non-`next/
 * image` uses of this helper (e.g. a fixed-size admin list thumbnail).
 */
export function getImageKitUrl(url: string, opts: ImageKitTransformOptions = {}): string {
  if (!url) return url;
  const { width, height, quality = 80, fit = 'cover' } = opts;

  const params: string[] = [];
  if (width) params.push(`w-${Math.round(width)}`);
  if (height) params.push(`h-${Math.round(height)}`);
  if (width && height && fit === 'contain') params.push('c-at_max');
  params.push(`q-${quality}`);
  // Automatic best-format delivery (WebP/AVIF where the requesting browser
  // supports it) — ImageKit negotiates this off the Accept header itself.
  params.push('f-auto');

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}tr=${params.join(',')}`;
}

/**
 * The general-purpose "give me this product photo at size X" helper —
 * reach for the named `get*ImageUrl` variants below for the app's standard
 * sizes; use this directly for a one-off size.
 */
export function getProductImage(url: string, opts: ImageKitTransformOptions): string {
  return getImageKitUrl(url, opts);
}

function getVariantImage(url: string, variant: ImageVariant, opts: Omit<ImageKitTransformOptions, 'width' | 'height'> = {}) {
  return getImageKitUrl(url, { ...IMAGE_VARIANTS[variant], ...opts });
}

/** ~300x300 — small previews and admin lists. */
export function getThumbnailUrl(url: string, opts: Omit<ImageKitTransformOptions, 'width' | 'height'> = {}) {
  return getVariantImage(url, 'thumbnail', opts);
}
/** ~600x600 — product grids. */
export function getCardImageUrl(url: string, opts: Omit<ImageKitTransformOptions, 'width' | 'height'> = {}) {
  return getVariantImage(url, 'card', opts);
}
/** ~1200x1200 — the product page. */
export function getDetailImageUrl(url: string, opts: Omit<ImageKitTransformOptions, 'width' | 'height'> = {}) {
  return getVariantImage(url, 'detail', opts);
}
/** ~2000x2000 max — only request this for an explicit zoom/lightbox view. */
export function getZoomImageUrl(url: string, opts: Omit<ImageKitTransformOptions, 'width' | 'height'> = {}) {
  return getVariantImage(url, 'zoom', opts);
}
