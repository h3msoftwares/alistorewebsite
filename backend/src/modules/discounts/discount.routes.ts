import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
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

const router = Router();
// Viewing discounts / coupons is STAFF-ok…
const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];
// …but creating / editing / deleting one changes what the store charges, so
// every mutation (POST / PATCH / DELETE) is ADMIN only (S4).
const adminOnly = [requireAuth, requireRole('ADMIN')];

// ---- Public: check a coupon code from the cart / checkout ----
router.post('/coupons/validate', validate({ body: validateCouponSchema }), asyncHandler(validateCouponHandler));

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

export default router;
