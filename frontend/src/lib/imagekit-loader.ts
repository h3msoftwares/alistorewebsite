/**
 * Custom next/image loader for ImageKit (free tier) — see next.config.mjs's
 * images.loader/loaderFile. ImageKit's own CDN already resizes/reformats on
 * the fly via the `tr=` query param, so this bypasses Next's built-in image
 * optimizer instead of stacking a second processing step on top of it.
 * Works against any full ImageKit URL already stored in ProductImage.url —
 * no NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT dependency here, since the loader
 * only needs to append transform params to whatever src it's given.
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
  return `${src}?tr=w-${width},q-${quality ?? 80}`;
}
