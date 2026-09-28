'use client';

import { usePermissions } from '@/lib/rbac';
import type { ReturnStatus } from '@/lib/types';

/** Shared gates for return controls in the Returns page and order screens. */
export function useReturnPermissions() {
  const { has } = usePermissions();
  const canHandleReturns = has('returns:manage');
  const canMarkRefunds = has('refunds:manage');
  return {
    canViewReturns: has('returns:view'),
    canHandleReturns,
    canMarkRefunds,
    canReturnWholeOrder: canHandleReturns && has('orders:manage'),
    canTransitionReturn: (status: ReturnStatus) => status === 'REFUNDED' ? canMarkRefunds : canHandleReturns,
  };
}
