import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware';
import { checkoutSchema, orderIdParamSchema, deliveryQuoteQuerySchema } from './order.schema';
import {
  checkoutHandler,
  deliveryQuoteHandler,
  listMyOrdersHandler,
  getOrderHandler,
  cancelOrderHandler,
} from './order.controller';

const router = Router();

// Checkout works for guests and logged-in users alike (COD only, per spec).
router.post('/checkout', optionalAuth, validate({ body: checkoutSchema }), asyncHandler(checkoutHandler));

// Live delivery-fee estimate for the caller's cart (GET → no CSRF).
router.get(
  '/delivery-quote',
  optionalAuth,
  validate({ query: deliveryQuoteQuerySchema }),
  asyncHandler(deliveryQuoteHandler)
);

// Order history/detail/cancel require an account — guests track orders via
// the confirmation they received instead.
router.get('/mine', requireAuth, asyncHandler(listMyOrdersHandler));
router.get('/:id', requireAuth, validate({ params: orderIdParamSchema }), asyncHandler(getOrderHandler));
router.post('/:id/cancel', requireAuth, validate({ params: orderIdParamSchema }), asyncHandler(cancelOrderHandler));

export default router;
