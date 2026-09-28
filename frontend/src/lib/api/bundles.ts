import { api } from './client';
import type { Bundle, BundleBody, UUID } from '../types';

export const listBundles = () => api.get<{ bundles: Bundle[] }>('/api/bundles').then((r) => r.bundles);
export const getBundle = (id: UUID) => api.get<{ bundle: Bundle }>(`/api/bundles/${id}`).then((r) => r.bundle);
export const createBundle = (body: BundleBody) => api.post<{ bundle: Bundle }>('/api/bundles', body).then((r) => r.bundle);
export const updateBundle = (id: UUID, body: Partial<BundleBody>) => api.patch<{ bundle: Bundle }>(`/api/bundles/${id}`, body).then((r) => r.bundle);
export const deleteBundle = (id: UUID) => api.del(`/api/bundles/${id}`);
