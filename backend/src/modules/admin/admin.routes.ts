import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
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
import roleRoutes from '../rbac/role.routes';
import customerRoutes from '../customers/customers.routes';
import returnRoutes from '../returns/return.routes';
import notificationRoutes from '../notifications/notification.routes';

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
// Step-up protected (S2): changing an order's fulfilment state is not
// reversible by the customer and moves money-tracking — on top of the
// `orders:manage` permission, require a password re-entry within the
// freshness window, not just a live session.
router.patch(
  '/orders/:id/status',
  requirePermission('orders:manage'),
  requireFreshAuth(),
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

// Step-up protected (S2): a direct stock write bypasses the ordinary
// stock-movement trail, so treat it like the order-status change above —
// `products:manage` plus a fresh password.
router.patch(
  '/variants/:variantId/stock',
  requirePermission('products:manage'),
  requireFreshAuth(),
  validate({ params: adminVariantParamSchema, body: updateStockSchema }),
  asyncHandler(updateStockHandler)
);

// Registered-customer directory + their order history. Its own permission
// area; per-route view/manage checks live in the sub-router.
router.use('/customers', customerRoutes);

// Anti-abuse block list sits with order operations.
router.use('/blacklist', requirePermission('orders:manage'), blacklistRoutes);
// Per-item returns — its own view/manage split, so it applies requirePermission
// per-route itself rather than one blanket permission at the mount (see
// return.routes.ts, same shape as rbac/role.routes.ts).
router.use('/returns', returnRoutes);
// Any admin can register their own device for push alerts — no extra permission.
router.use('/push-subscriptions', pushRoutes);
// Same "any admin, no extra permission" shape — row-level filtering inside
// the service already scopes what each caller actually sees.
router.use('/notifications', notificationRoutes);

router.use('/', roleRoutes);

export default router;
