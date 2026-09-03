import Link from 'next/link';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

// Shown for unmatched routes within the [locale] segment. `notFound()` from a
// page also renders this. Locale-agnostic copy — the link falls back to /en.
export default function NotFound() {
  return (
    <div className="container">
      <EmptyState
        icon={Compass}
        title="Page not found"
        body="The page you're looking for doesn't exist or has moved."
        action={
          <Link className="btn btn--primary" href="/en">
            Back to store
          </Link>
        }
      />
    </div>
  );
}
