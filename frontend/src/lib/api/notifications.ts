import { api } from './client';
import type { NotificationsResponse, UUID } from '../types';

// All under /api/admin/notifications — any STAFF/ADMIN (no extra permission
// needed, same precedent as push-subscriptions); row-level filtering by
// `requiredPermission` happens server-side, so the caller only ever sees
// what they're allowed to.

export function listNotifications(unreadOnly?: boolean) {
  return api.get<NotificationsResponse>('/api/admin/notifications', { query: { unreadOnly } });
}

export function markNotificationRead(id: UUID) {
  return api.post(`/api/admin/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return api.post('/api/admin/notifications/read-all');
}
