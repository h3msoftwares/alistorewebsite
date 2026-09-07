import { api } from './client';

export interface PushSubscriptionBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function saveSubscription(body: PushSubscriptionBody) {
  return api.post<void>('/api/admin/push-subscriptions', body);
}

export function deleteSubscription(endpoint: string) {
  return api.del<void>('/api/admin/push-subscriptions', { body: { endpoint } });
}
