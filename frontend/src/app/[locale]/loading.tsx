import { ProductGridSkeleton, Skeleton } from '@/components/ui/skeleton';

// Route-level loading UI for the storefront segment. Shown while a page's
// server data resolves. Keep it structural (skeletons), not a blocking
// spinner — see docs/design-system.md §states.
export default function StorefrontLoading() {
  return (
    <div className="container section" aria-busy="true" aria-live="polite">
      <Skeleton variant="title" style={{ width: '40%', marginBottom: 'var(--space-6)' }} />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
