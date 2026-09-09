import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { analyticsRangeQuerySchema } from './analytics.schema';
import {
  overviewHandler,
  salesHandler,
  customersHandler,
  inventoryHandler,
  productsHandler,
  visitorsHandler,
  funnelHandler,
} from './analytics.controller';

// Mounted at /api/admin/analytics — the parent admin router already applies
// requireAuth + requireRole('STAFF', 'ADMIN'). S4: the revenue-bearing
// reports (sales, customers) are additionally ADMIN only; the operational
// ones (inventory, products, visitors, funnel, overview) stay STAFF.
const router = Router();
const adminOnly = requireRole('ADMIN');

router.use(validate({ query: analyticsRangeQuerySchema }));

router.get('/overview', asyncHandler(overviewHandler));
router.get('/sales', adminOnly, asyncHandler(salesHandler));
router.get('/customers', adminOnly, asyncHandler(customersHandler));
router.get('/inventory', asyncHandler(inventoryHandler));
router.get('/products', asyncHandler(productsHandler));
router.get('/visitors', asyncHandler(visitorsHandler));
router.get('/funnel', asyncHandler(funnelHandler));

export default router;
