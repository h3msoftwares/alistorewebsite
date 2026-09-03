import { Skeleton } from '@/components/ui/skeleton';

// Route-level loading UI for the /admin subtree — a table-shaped skeleton.
export default function AdminLoading() {
  return (
    <div className="section" aria-busy="true" aria-live="polite">
      <Skeleton variant="title" style={{ width: '30%', marginBottom: 'var(--space-6)' }} />
      <div className="stack">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} variant="line" />
        ))}
      </div>
    </div>
  );
}
