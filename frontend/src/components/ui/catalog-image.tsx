'use client';

import { useState } from 'react';
import Image, { type ImageProps } from 'next/image';

export type CatalogImageProps = Omit<ImageProps, 'onError'>;

/**
 * A thin next/image wrapper for every product/collection/category photo in
 * the storefront and admin. On a load failure (a deleted or unreachable
 * ImageKit asset, a network blip) it swaps to a neutral placeholder instead
 * of leaving the browser's broken-image icon in the card, and logs once so
 * the failure is still visible (console/monitoring) rather than silently
 * swallowed. Resets if the `src` itself changes (e.g. a colour swatch
 * swapping the shown photo) so a later, working image gets a fresh try.
 */
export function CatalogImage({ src, alt, ...props }: CatalogImageProps) {
  const [failedSrc, setFailedSrc] = useState<CatalogImageProps['src'] | null>(null);

  if (failedSrc === src) {
    return <span className="catalog-image__fallback" aria-hidden />;
  }

  return (
    <Image
      {...props}
      src={src}
      alt={alt}
      onError={() => {
        console.error('[image] failed to load:', src);
        setFailedSrc(src);
      }}
    />
  );
}
