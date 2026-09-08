import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
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
  reviewOrderHandler,
  salesDashboardHandler,
} from '../orders/order.controller';
import { updateStockHandler } from '../catalog/product.controller';
import analyticsRoutes from '../analytics/analytics.routes';
import blacklistRoutes from '../blacklist/blacklist.routes';
import pushRoutes from '../push/push.routes';
import roleRoutes from '../rbac/role.routes';

const router = Router();

// Every route below is staff/admin-only — mounted separately from the
// public /api/orders and /api/products routers so the split stays obvious
// at the app.ts level rather than being buried in per-route guards.
router.use(requireAuth, requireRole('STAFF', 'ADMIN'));

router.get('/dashboard', requirePermission('dashboard:view'), asyncHandler(salesDashboardHandler));

router.use('/analytics', requirePermission('analytics:view'), analyticsRoutes);

router.get(
  '/orders',
  requirePermission('orders:view'),
  validate({ query: adminListOrdersQuerySchema }),
  asyncHandler(listAllOrdersHandler)
);
router.patch(
  '/orders/:id/status',
  requirePermission('orders:manage'),
  validate({ params: orderIdParamSchema, body: updateOrderStatusSchema }),
  asyncHandler(updateOrderStatusHandler)
);
router.patch(
  '/orders/:id/collected',
  requirePermission('orders:manage'),
  validate({ params: orderIdParamSchema, body: markCollectedSchema }),
  asyncHandler(markCodCollectedHandler)
);
router.patch(
  '/orders/:id/review',
  requirePermission('orders:manage'),
  validate({ params: orderIdParamSchema }),
  asyncHandler(reviewOrderHandler)
);

router.patch(
  '/variants/:variantId/stock',
  requirePermission('products:manage'),
  validate({ params: adminVariantParamSchema, body: updateStockSchema }),
  asyncHandler(updateStockHandler)
);

// Anti-abuse block list sits with order operations.
router.use('/blacklist', requirePermission('orders:manage'), blacklistRoutes);
// Any admin can register their own device for push alerts — no extra permission.
router.use('/push-subscriptions', pushRoutes);

router.use('/', roleRoutes);

export default router;
