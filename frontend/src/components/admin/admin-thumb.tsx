'use client';

import { useState } from 'react';
import { getThumbnailUrl } from '@/lib/imagekit-url';

/**
 * Small fixed-size list-row thumbnail for the admin Collections/Categories/
 * Products tables — a plain `<img>`, not `next/image`: the URL is already a
 * complete ImageKit transform from `getThumbnailUrl`, and routing it through
 * `next/image`'s custom loader too would append a second, conflicting `tr=`
 * query param on top of the first. Falls back to a neutral placeholder when
 * there's no image yet, or if the request one fails to load.
 */
export function AdminThumb({ url, alt }: { url?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return <span className="admin-thumb admin-thumb--empty" aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- deliberate: see the file doc comment above.
    <img
      src={getThumbnailUrl(url)}
      alt={alt}
      className="admin-thumb"
      loading="lazy"
      onError={() => {
        console.error('[image] admin thumbnail failed to load:', url);
        setFailed(true);
      }}
    />
  );
}
