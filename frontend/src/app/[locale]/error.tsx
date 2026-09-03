'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

// Route-level error boundary for the storefront segment. Must be a client
// component (Next.js contract). Always offers a recovery path (retry).
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: forward to an error-reporting service once one is wired up.
    console.error(error);
  }, [error]);

  return (
    <div className="container">
      <EmptyState
        tone="alert"
        icon={AlertTriangle}
        title="Something went wrong"
        body="We couldn't load this page. Please try again."
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
