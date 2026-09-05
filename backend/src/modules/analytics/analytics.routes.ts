import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
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
// requireAuth + requireRole('STAFF', 'ADMIN'), so no extra guard here.
const router = Router();

router.use(validate({ query: analyticsRangeQuerySchema }));

router.get('/overview', asyncHandler(overviewHandler));
router.get('/sales', asyncHandler(salesHandler));
router.get('/customers', asyncHandler(customersHandler));
router.get('/inventory', asyncHandler(inventoryHandler));
router.get('/products', asyncHandler(productsHandler));
router.get('/visitors', asyncHandler(visitorsHandler));
router.get('/funnel', asyncHandler(funnelHandler));

export default router;
