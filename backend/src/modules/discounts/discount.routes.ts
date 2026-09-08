import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import {
  createDiscountSchema,
  updateDiscountSchema,
  discountIdParamSchema,
} from './discount.schema';
import {
  createCouponSchema,
  updateCouponSchema,
  couponIdParamSchema,
  validateCouponSchema,
} from './coupon.schema';
import {
  listDiscountsHandler,
  createDiscountHandler,
  updateDiscountHandler,
  deleteDiscountHandler,
  listCouponsHandler,
  createCouponHandler,
  updateCouponHandler,
  deleteCouponHandler,
  validateCouponHandler,
} from './discount.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * `discountRoutes` is a factory so the public coupon-check endpoint can carry
 * a dedicated per-IP limiter (defaults ON; buildApp turns it off under test).
 * Without it, `POST /api/coupons/validate` is an unauthenticated code oracle
 * — a 200 vs 404 (plus the returned discount) enumerates valid coupon codes
 * at the app-wide baseline rate.
 */
export function discountRoutes(opts: { validateCouponRateLimit?: boolean } = {}): Router {
  const router = Router();
  const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];
  // Viewing vs. managing discounts/coupons is gated by the RBAC permission
  // system (see lib/permissions.ts). `discounts:manage` is what "changes what
  // the store charges" — POST / PATCH / DELETE.
  const canView = [...admin, requirePermission('discounts:view')];
  const canManage = [...admin, requirePermission('discounts:manage')];

  const validateCouponLimiter: RequestHandler =
    opts.validateCouponRateLimit === false
      ? passThrough
      : rateLimit({
          windowMs: 15 * 60 * 1000,
          max: 20,
          standardHeaders: true,
          legacyHeaders: false,
          message: RATE_LIMITED_BODY,
        });

  // ---- Public: check a coupon code from the cart / checkout ----
  router.post(
    '/coupons/validate',
    validateCouponLimiter,
    validate({ body: validateCouponSchema }),
    asyncHandler(validateCouponHandler)
  );

  // ---- Discounts: view = discounts:view, write = discounts:manage ----
  router.get('/discounts', ...canView, asyncHandler(listDiscountsHandler));
  router.post('/discounts', ...canManage, validate({ body: createDiscountSchema }), asyncHandler(createDiscountHandler));
  router.patch(
    '/discounts/:id',
    ...canManage,
    validate({ params: discountIdParamSchema, body: updateDiscountSchema }),
    asyncHandler(updateDiscountHandler)
  );
  router.delete(
    '/discounts/:id',
    ...canManage,
    validate({ params: discountIdParamSchema }),
    asyncHandler(deleteDiscountHandler)
  );

  // ---- Coupons: view = discounts:view, write = discounts:manage ----
  router.get('/coupons', ...canView, asyncHandler(listCouponsHandler));
  router.post('/coupons', ...canManage, validate({ body: createCouponSchema }), asyncHandler(createCouponHandler));
  router.patch(
    '/coupons/:id',
    ...canManage,
    validate({ params: couponIdParamSchema, body: updateCouponSchema }),
    asyncHandler(updateCouponHandler)
  );
  router.delete(
    '/coupons/:id',
    ...canManage,
    validate({ params: couponIdParamSchema }),
    asyncHandler(deleteCouponHandler)
  );

  return router;
}
