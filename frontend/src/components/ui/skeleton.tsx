import type { CSSProperties } from 'react';

export interface SkeletonProps {
  variant?: 'text' | 'title' | 'media' | 'line' | 'block';
  width?: string;
  height?: string;
  className?: string;
  style?: CSSProperties;
}

/** Shimmer placeholder on the .skeleton class. The shimmer stops under
 *  `prefers-reduced-motion` (handled in globals.css). */
export function Skeleton({ variant = 'text', width, height, className, style }: SkeletonProps) {
  return (
    <span
      className={['skeleton', variant !== 'block' && `skeleton--${variant}`, className].filter(Boolean).join(' ')}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

/** A grid of product-card skeletons for collection/listing loading states. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="skeleton-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton variant="media" />
          <Skeleton variant="text" width="80%" />
          <Skeleton variant="text" width="40%" />
        </div>
      ))}
    </div>
  );
}
