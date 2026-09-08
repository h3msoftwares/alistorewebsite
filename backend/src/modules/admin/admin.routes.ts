import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { requireFreshAuth } from '../../middleware/step-up.middleware';
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
// Step-up protected (S2): changing an order's fulfilment state is not
// reversible by the customer and moves money-tracking — require a password
// re-entry within the freshness window, not just a live session.
router.patch(
  '/orders/:id/status',
  requireFreshAuth(),
  validate({ params: orderIdParamSchema, body: updateOrderStatusSchema }),
  asyncHandler(updateOrderStatusHandler)
);
router.patch(
  '/orders/:id/collected',
  validate({ params: orderIdParamSchema, body: markCollectedSchema }),
  asyncHandler(markCodCollectedHandler)
);
router.patch(
  '/orders/:id/review',
  validate({ params: orderIdParamSchema }),
  asyncHandler(reviewOrderHandler)
);

// Step-up protected (S2): a direct stock write bypasses the ordinary
// stock-movement trail, so treat it like the order-status change above.
router.patch(
  '/variants/:variantId/stock',
  requireFreshAuth(),
  validate({ params: adminVariantParamSchema, body: updateStockSchema }),
  asyncHandler(updateStockHandler)
);

router.use('/blacklist', blacklistRoutes);
router.use('/push-subscriptions', pushRoutes);

export default router;
