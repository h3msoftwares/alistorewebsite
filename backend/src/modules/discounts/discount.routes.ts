import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
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
  // Viewing discounts / coupons is STAFF-ok…
  const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];
  // …but creating / editing / deleting one changes what the store charges, so
  // every mutation (POST / PATCH / DELETE) is ADMIN only (S4).
  const adminOnly = [requireAuth, requireRole('ADMIN')];

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

  // ---- Discounts: read STAFF+ADMIN, write ADMIN ----
  router.get('/discounts', ...admin, asyncHandler(listDiscountsHandler));
  router.post('/discounts', ...adminOnly, validate({ body: createDiscountSchema }), asyncHandler(createDiscountHandler));
  router.patch(
    '/discounts/:id',
    ...adminOnly,
    validate({ params: discountIdParamSchema, body: updateDiscountSchema }),
    asyncHandler(updateDiscountHandler)
  );
  router.delete(
    '/discounts/:id',
    ...adminOnly,
    validate({ params: discountIdParamSchema }),
    asyncHandler(deleteDiscountHandler)
  );

  // ---- Coupons: read STAFF+ADMIN, write ADMIN ----
  router.get('/coupons', ...admin, asyncHandler(listCouponsHandler));
  router.post('/coupons', ...adminOnly, validate({ body: createCouponSchema }), asyncHandler(createCouponHandler));
  router.patch(
    '/coupons/:id',
    ...adminOnly,
    validate({ params: couponIdParamSchema, body: updateCouponSchema }),
    asyncHandler(updateCouponHandler)
  );
  router.delete(
    '/coupons/:id',
    ...adminOnly,
    validate({ params: couponIdParamSchema }),
    asyncHandler(deleteCouponHandler)
  );

  return router;
}
