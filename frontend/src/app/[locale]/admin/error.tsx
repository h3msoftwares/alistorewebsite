'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

// Route-level error boundary for the /admin subtree.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      tone="alert"
      icon={AlertTriangle}
      title="Admin action failed"
      body="The request didn't complete. Retry, or reload if it keeps failing."
      action={
        <Button variant="primary" onClick={reset}>
          Retry
        </Button>
      }
    />
  );
}
