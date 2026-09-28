import { expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { queryKeys } from '@/lib/query-keys';
import { useUpdateReturnStatus } from './use-returns';
import { returnsApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({ returnsApi: { adminUpdateReturnStatus: vi.fn() } }));

it.each(['RECEIVED', 'REFUNDED'] as const)('refreshes cached financial and unit reports after marking %s', async (status) => {
  vi.mocked(returnsApi.adminUpdateReturnStatus).mockResolvedValue({ id: 'r1', status } as never);
  const { Wrapper, queryClient } = createWrapper();
  queryClient.setDefaultOptions({ queries: { gcTime: Infinity } });
  const keys = [queryKeys.analytics.report('sales', '30d'), queryKeys.orders.dashboard(),
    queryKeys.orders.detail('o1'), queryKeys.returns.admin()];
  for (const key of keys) queryClient.setQueryData(key, { old: true });
  const { result } = renderHook(() => useUpdateReturnStatus(), { wrapper: Wrapper });
  await act(async () => { await result.current.mutateAsync({ id: 'r1', status }); });
  for (const key of keys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
});
