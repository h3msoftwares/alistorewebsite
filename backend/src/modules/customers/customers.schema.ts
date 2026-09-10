import { z } from 'zod';

/** GET /api/admin/customers — the registered-customer list for the admin
 *  Customers page. `status` filters on the account's active flag; `sort`
 *  covers the DB-native orderings plus "most orders" (relation `_count`). */
export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'inactive', 'all']).optional().default('all'),
  sort: z.enum(['newest', 'oldest', 'name', 'orders']).optional().default('newest'),
  page: z.coerce.number().int().min(1).max(100_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const customerIdParamSchema = z.object({
  id: z.string().uuid(),
});

/** PATCH /api/admin/customers/:id — the only mutable field is the login
 *  toggle (a blocked customer can't sign in or check out). */
export const updateCustomerSchema = z.object({
  isActive: z.boolean(),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
