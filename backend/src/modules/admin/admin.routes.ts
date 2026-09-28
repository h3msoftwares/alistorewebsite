import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission, requireAnyPermission } from '../../middleware/rbac.middleware';
import { requireFreshAuth } from '../../middleware/step-up.middleware';
import {
  orderIdParamSchema,
  updateOrderStatusSchema,
  correctOrderStatusSchema,
  markCollectedSchema,
  adminListOrdersQuerySchema,
} from '../orders/order.schema';
import { updateStockSchema, adminVariantParamSchema } from '../catalog/product.schema';
import {
  listAllOrdersHandler,
  updateOrderStatusHandler,
  correctOrderStatusHandler,
  markCodCollectedHandler,
  collectionSummaryHandler,
  reviewOrderHandler,
  salesDashboardHandler,
  returnWorkSummaryHandler,
} from '../orders/order.controller';
import { updateStockHandler } from '../catalog/product.controller';
import analyticsRoutes from '../analytics/analytics.routes';
import blacklistRoutes from '../blacklist/blacklist.routes';
import pushRoutes from '../push/push.routes';
import roleRoutes from '../rbac/role.routes';
import customerRoutes from '../customers/customers.routes';
import returnRoutes from '../returns/return.routes';
import { createReturnSchema } from '../returns/return.schema';
import { adminRequestReturnHandler, adminPreviewReturnHandler } from '../returns/return.controller';
import notificationRoutes from '../notifications/notification.routes';
import { cashPayoutSchema, createGoodwillSchema, cancelGoodwillSchema, goodwillParamSchema } from '../refunds/refund.schema';
import { createGoodwill, payGoodwill, cancelGoodwill, getRefundSummary } from '../refunds/refund.service';
import { paramString } from '../../lib/params';

const router = Router();

// Every route below is staff/admin-only — mounted separately from the
// public /api/orders and /api/products routers so the split stays obvious
// at the app.ts level rather than being buried in per-route guards.
router.use(requireAuth, requireRole('STAFF', 'ADMIN'));

router.get('/dashboard', requirePermission('dashboard:view'), asyncHandler(salesDashboardHandler));
router.get('/orders/return-work', requirePermission('orders:view'), asyncHandler(returnWorkSummaryHandler));

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
  (req, res, next) => req.body?.status === 'RETURNED' ? requirePermission('returns:manage')(req, res, next) : next(),
  requireFreshAuth(),
  validate({ params: orderIdParamSchema, body: updateOrderStatusSchema }),
  asyncHandler(updateOrderStatusHandler)
);
router.patch(
  '/orders/:id/correction',
  requirePermission('orders:manage'),
  requirePermission('order_corrections:manage'),
  (req, res, next) => req.body?.status === 'RETURNED' ? requirePermission('returns:manage')(req, res, next) : next(),
  requireFreshAuth(),
  validate({ params: orderIdParamSchema, body: correctOrderStatusSchema }),
  asyncHandler(correctOrderStatusHandler)
);
router.patch(
  '/orders/:id/collected',
  requirePermission('payments:manage'),
  requireFreshAuth(),
  validate({ params: orderIdParamSchema, body: markCollectedSchema }),
  asyncHandler(markCodCollectedHandler)
);
router.get('/orders/:id/collections', requireAnyPermission('payments:view', 'orders:view'),
  validate({ params: orderIdParamSchema }), asyncHandler(collectionSummaryHandler));
router.get('/orders/:id/refunds', requirePermission('orders:view'),
  validate({ params: orderIdParamSchema }), asyncHandler(async (req, res) => { res.json(await getRefundSummary(paramString(req.params.id))); }));
router.post('/orders/:id/goodwill-refunds', requirePermission('refunds:manage'), requireFreshAuth(),
  validate({ params: orderIdParamSchema, body: createGoodwillSchema }), asyncHandler(async (req, res) => {
    res.status(201).json({ refund: await createGoodwill(paramString(req.params.id), req.body, req.user!.id) });
  }));
router.post('/orders/:id/goodwill-refunds/:goodwillId/pay', requirePermission('refunds:manage'), requireFreshAuth(),
  validate({ params: goodwillParamSchema, body: cashPayoutSchema }), asyncHandler(async (req, res) => {
    res.json({ refund: await payGoodwill(paramString(req.params.id), paramString(req.params.goodwillId), req.body, req.user!.id) });
  }));
router.post('/orders/:id/goodwill-refunds/:goodwillId/cancel', requirePermission('refunds:manage'), requireFreshAuth(),
  validate({ params: goodwillParamSchema, body: cancelGoodwillSchema }), asyncHandler(async (req, res) => {
    res.json({ refund: await cancelGoodwill(paramString(req.params.id), paramString(req.params.goodwillId), req.body, req.user!.id) });
  }));
router.patch(
  '/orders/:id/review',
  requirePermission('orders:manage'),
  validate({ params: orderIdParamSchema }),
  asyncHandler(reviewOrderHandler)
);
// Staff-initiated return (e.g. a phone order) — same DELIVERED gate + atomic
// returnedQuantity claim as the customer-facing route in order.routes.ts,
// just without the owning-customer check. Step-up like the return-status
// route below: it immediately claims the returned quantity, same bar as an
// order-status change.
router.post(
  '/orders/:id/returns',
  requirePermission('returns:manage'),
  requireFreshAuth(),
  validate({ params: orderIdParamSchema, body: createReturnSchema }),
  asyncHandler(adminRequestReturnHandler)
);
router.post('/orders/:id/returns/preview', requirePermission('returns:manage'),
  validate({ params: orderIdParamSchema, body: createReturnSchema }), asyncHandler(adminPreviewReturnHandler));

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
