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
const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];

// ---- Public: check a coupon code from the cart / checkout ----
router.post('/coupons/validate', validate({ body: validateCouponSchema }), asyncHandler(validateCouponHandler));

// ---- Admin: catalog discounts ----
router.get('/discounts', ...admin, asyncHandler(listDiscountsHandler));
router.post('/discounts', ...admin, validate({ body: createDiscountSchema }), asyncHandler(createDiscountHandler));
router.patch(
  '/discounts/:id',
  ...admin,
  validate({ params: discountIdParamSchema, body: updateDiscountSchema }),
  asyncHandler(updateDiscountHandler)
);
router.delete(
  '/discounts/:id',
  ...admin,
  validate({ params: discountIdParamSchema }),
  asyncHandler(deleteDiscountHandler)
);

// ---- Admin: coupons ----
router.get('/coupons', ...admin, asyncHandler(listCouponsHandler));
router.post('/coupons', ...admin, validate({ body: createCouponSchema }), asyncHandler(createCouponHandler));
router.patch(
  '/coupons/:id',
  ...admin,
  validate({ params: couponIdParamSchema, body: updateCouponSchema }),
  asyncHandler(updateCouponHandler)
);
router.delete(
  '/coupons/:id',
  ...admin,
  validate({ params: couponIdParamSchema }),
  asyncHandler(deleteCouponHandler)
);

export default router;
