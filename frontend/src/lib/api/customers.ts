import { api } from './client';
import type {
  AdminCustomerDetail,
  AdminCustomerListResponse,
  AdminCustomerSummary,
  CustomerListQuery,
  UUID,
} from '../types';

// All under /api/admin — gated by requireRole('STAFF','ADMIN') then
// requirePermission('customers:view' | 'customers:manage').

export function adminListCustomers(query: CustomerListQuery = {}) {
  return api.get<AdminCustomerListResponse>('/api/admin/customers', {
    query: {
      search: query.search || undefined,
      status: query.status && query.status !== 'all' ? query.status : undefined,
      sort: query.sort && query.sort !== 'newest' ? query.sort : undefined,
      page: query.page && query.page > 1 ? query.page : undefined,
      pageSize: query.pageSize,
    },
  });
}

export function adminGetCustomer(id: UUID) {
  return api
    .get<{ customer: AdminCustomerDetail }>(`/api/admin/customers/${id}`)
    .then((r) => r.customer);
}

/** Block / unblock a customer's account (they can't sign in or check out while
 *  blocked). Returns the refreshed list-row summary. */
export function adminSetCustomerActive(id: UUID, isActive: boolean) {
  return api
    .patch<{ customer: AdminCustomerSummary }>(`/api/admin/customers/${id}`, { isActive })
    .then((r) => r.customer);
}
