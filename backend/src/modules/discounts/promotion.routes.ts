import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import { RATE_LIMITED_BODY } from '../../lib/rate-limit';
import {
  createPromotionSchema,
  updatePromotionSchema,
  promotionIdParamSchema,
} from './promotion.schema';
import {
  createCouponSchema,
  updateCouponSchema,
  couponIdParamSchema,
  validateCouponSchema,
} from './coupon.schema';
import {
  listPromotionsHandler,
  getPromotionHandler,
  createPromotionHandler,
  updatePromotionHandler,
  deletePromotionHandler,
  listCouponsHandler,
  createCouponHandler,
  updateCouponHandler,
  deleteCouponHandler,
  validateCouponHandler,
} from './promotion.controller';

const passThrough: RequestHandler = (_req, _res, next) => next();

/**
 * `promotionRoutes` is a factory so the public coupon-check endpoint can
 * carry a dedicated per-IP limiter (defaults ON; buildApp turns it off under
 * test). Without it, `POST /api/coupons/validate` is an unauthenticated code
 * oracle — a 200 vs 404 (plus the returned coupon) enumerates valid coupon
 * codes at the app-wide baseline rate.
 *
 * Named for the module (Stage 2: Promotion replaces the old Discount model
 * outright — see promotion.service.ts), but the RBAC permission keys stay
 * `discounts:*` and the admin UI area stays "Discounts & coupons": renaming
 * a permission string would silently revoke it from every stored
 * `Role.permissions` row in the DB, a real migration hazard for zero benefit
 * — deliberately not done. Coupons are untouched by the Stage 2 redesign.
 */
export function promotionRoutes(opts: { validateCouponRateLimit?: boolean } = {}): Router {
  const router = Router();
  const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];
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

  // ---- Promotions: view = discounts:view, write = discounts:manage ----
  router.get('/promotions', ...canView, asyncHandler(listPromotionsHandler));
  router.get(
    '/promotions/:id',
    ...canView,
    validate({ params: promotionIdParamSchema }),
    asyncHandler(getPromotionHandler)
  );
  router.post(
    '/promotions',
    ...canManage,
    validate({ body: createPromotionSchema }),
    asyncHandler(createPromotionHandler)
  );
  router.patch(
    '/promotions/:id',
    ...canManage,
    validate({ params: promotionIdParamSchema, body: updatePromotionSchema }),
    asyncHandler(updatePromotionHandler)
  );
  router.delete(
    '/promotions/:id',
    ...canManage,
    validate({ params: promotionIdParamSchema }),
    asyncHandler(deletePromotionHandler)
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
