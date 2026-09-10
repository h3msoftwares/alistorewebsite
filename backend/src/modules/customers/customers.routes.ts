import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import {
  listCustomersQuerySchema,
  customerIdParamSchema,
  updateCustomerSchema,
} from './customers.schema';
import {
  listCustomersHandler,
  getCustomerHandler,
  updateCustomerHandler,
} from './customers.controller';

const router = Router();

// Mounted under /api/admin (which already requires a STAFF/ADMIN session);
// re-assert it so the router is safe wherever it's mounted.
router.use(requireAuth, requireRole('STAFF', 'ADMIN'));

const canView = requirePermission('customers:view');
const canManage = requirePermission('customers:manage');

router.get(
  '/',
  canView,
  validate({ query: listCustomersQuerySchema }),
  asyncHandler(listCustomersHandler)
);

router.get(
  '/:id',
  canView,
  validate({ params: customerIdParamSchema }),
  asyncHandler(getCustomerHandler)
);

router.patch(
  '/:id',
  canManage,
  validate({ params: customerIdParamSchema, body: updateCustomerSchema }),
  asyncHandler(updateCustomerHandler)
);

export default router;
