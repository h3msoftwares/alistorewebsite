import { api } from './client';
import type { CreateReturnBody, Return, ReturnStatus, UUID } from '../types';

// ---- Storefront (session + guest-token variants, same shape as orders.ts's
// own cancel/cancelByToken pair) ----

export function requestReturn(orderId: UUID, body: CreateReturnBody) {
  return api.post<{ return: Return }>(`/api/orders/${orderId}/returns`, body).then((r) => r.return);
}

export function requestReturnByToken(token: string, body: CreateReturnBody) {
  return api
    .post<{ return: Return }>(`/api/orders/track/${token}/returns`, body)
    .then((r) => r.return);
}

export function cancelReturn(orderId: UUID, returnId: UUID) {
  return api
    .post<{ return: Return }>(`/api/orders/${orderId}/returns/${returnId}/cancel`)
    .then((r) => r.return);
}

export function cancelReturnByToken(token: string, returnId: UUID) {
  return api
    .post<{ return: Return }>(`/api/orders/track/${token}/returns/${returnId}/cancel`)
    .then((r) => r.return);
}

// ---- Admin ----

export function adminListReturns(statuses?: ReturnStatus[]) {
  return api
    .get<{ returns: Return[] }>('/api/admin/returns', {
      query: { status: statuses?.length ? statuses.join(',') : undefined },
    })
    .then((r) => r.returns);
}

export function adminUpdateReturnStatus(id: UUID, status: ReturnStatus) {
  return api.patch<{ return: Return }>(`/api/admin/returns/${id}/status`, { status }).then((r) => r.return);
}
