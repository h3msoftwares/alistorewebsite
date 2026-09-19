import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import { requireFreshAuth } from '../../middleware/step-up.middleware';
import { adminListReturnsQuerySchema, returnIdParamSchema, updateReturnStatusSchema } from './return.schema';
import { listAdminReturnsHandler, updateReturnStatusHandler } from './return.controller';

const router = Router();

// Coarse gate for the whole subtree; per-route permission checks below.
// Same convention as rbac/role.routes.ts — this module reuses the orders
// permission area rather than adding its own (a Return is fundamentally an
// order sub-resource, same precedent as the Blacklist module).
router.use(requireAuth, requireRole('STAFF', 'ADMIN'));

router.get(
  '/',
  requirePermission('orders:view'),
  validate({ query: adminListReturnsQuerySchema }),
  asyncHandler(listAdminReturnsHandler)
);

// Step-up protected (S2), same bar as PATCH /orders/:id/status: approving a
// return and reaching REFUNDED both move refund/inventory bookkeeping, not
// just reversible by the customer.
router.patch(
  '/:id/status',
  requirePermission('orders:manage'),
  requireFreshAuth(),
  validate({ params: returnIdParamSchema, body: updateReturnStatusSchema }),
  asyncHandler(updateReturnStatusHandler)
);

export default router;
