'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bundlesApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { BundleBody } from '@/lib/types';

export function useBundles() { return useQuery({ queryKey: ['bundles'], queryFn: bundlesApi.listBundles }); }
export function useBundle(id: string) { return useQuery({ queryKey: ['bundles', id], queryFn: () => bundlesApi.getBundle(id), enabled: Boolean(id) }); }
export function useSaveBundle(id?: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: BundleBody) => id ? bundlesApi.updateBundle(id, body) : bundlesApi.createBundle(body), onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['bundles'] });
    qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
    qc.invalidateQueries({ queryKey: ['orders', 'delivery-quote'] });
  } });
}
export function useDeleteBundle() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: bundlesApi.deleteBundle, onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['bundles'] });
    qc.invalidateQueries({ queryKey: queryKeys.cart.root() });
    qc.invalidateQueries({ queryKey: ['orders', 'delivery-quote'] });
  } });
}
