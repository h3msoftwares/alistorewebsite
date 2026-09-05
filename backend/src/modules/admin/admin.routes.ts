import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  orderIdParamSchema,
  updateOrderStatusSchema,
  markCollectedSchema,
  adminListOrdersQuerySchema,
} from '../orders/order.schema';
import { updateStockSchema, adminVariantParamSchema } from '../catalog/product.schema';
import {
  listAllOrdersHandler,
  updateOrderStatusHandler,
  markCodCollectedHandler,
  salesDashboardHandler,
} from '../orders/order.controller';
import { updateStockHandler } from '../catalog/product.controller';
import analyticsRoutes from '../analytics/analytics.routes';

const router = Router();

// Every route below is staff/admin-only — mounted separately from the
// public /api/orders and /api/products routers so the split stays obvious
// at the app.ts level rather than being buried in per-route guards.
router.use(requireAuth, requireRole('STAFF', 'ADMIN'));

router.get('/dashboard', asyncHandler(salesDashboardHandler));

router.use('/analytics', analyticsRoutes);

router.get(
  '/orders',
  validate({ query: adminListOrdersQuerySchema }),
  asyncHandler(listAllOrdersHandler)
);
router.patch(
  '/orders/:id/status',
  validate({ params: orderIdParamSchema, body: updateOrderStatusSchema }),
  asyncHandler(updateOrderStatusHandler)
);
router.patch(
  '/orders/:id/collected',
  validate({ params: orderIdParamSchema, body: markCollectedSchema }),
  asyncHandler(markCodCollectedHandler)
);

router.patch(
  '/variants/:variantId/stock',
  validate({ params: adminVariantParamSchema, body: updateStockSchema }),
  asyncHandler(updateStockHandler)
);

export default router;
