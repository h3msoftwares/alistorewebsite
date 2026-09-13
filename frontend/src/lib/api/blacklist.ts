import { api } from './client';
import type { BlacklistEntry, BlacklistEntryBody, UUID } from '../types';

// All under /api/admin/blacklist — gated by requireRole('STAFF','ADMIN') then
// requirePermission('orders:manage') at the router mount (see
// admin.routes.ts) — even listing needs orders:manage, not just orders:view.

export function listBlacklist() {
  return api.get<{ entries: BlacklistEntry[] }>('/api/admin/blacklist').then((r) => r.entries);
}

export function createBlacklistEntry(body: BlacklistEntryBody) {
  return api.post<{ entry: BlacklistEntry }>('/api/admin/blacklist', body).then((r) => r.entry);
}

export function deleteBlacklistEntry(id: UUID) {
  return api.del(`/api/admin/blacklist/${id}`);
}
