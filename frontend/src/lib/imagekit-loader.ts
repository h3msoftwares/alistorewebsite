import { getImageKitUrl } from './imagekit-url';

/**
 * Custom next/image loader for ImageKit (free tier) — see next.config.mjs's
 * images.loader/loaderFile. ImageKit's own CDN already resizes/reformats on
 * the fly via the `tr=` query param, so this bypasses Next's built-in image
 * optimizer instead of stacking a second processing step on top of it.
 * Works against any full ImageKit URL already stored in ProductImage.url —
 * no NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT dependency here, since the loader
 * only needs to append transform params to whatever src it's given.
 *
 * Delegates to the same getImageKitUrl() used for one-off, non-`next/image`
 * URLs (e.g. admin list thumbnails) so both paths build the `tr=` param
 * identically. `next/image` never passes a `height` here (including in
 * `fill` mode, used everywhere in this app), so this always resolves to a
 * plain width+quality+format resize — the browser's CSS `object-fit` owns
 * cropping for every `next/image` call site.
 */
export default function imagekitLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  return getImageKitUrl(src, { width, quality });
}
