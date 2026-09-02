import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware';
import { checkoutSchema, orderIdParamSchema } from './order.schema';
import {
  checkoutHandler,
  listMyOrdersHandler,
  getOrderHandler,
  cancelOrderHandler,
} from './order.controller';

const router = Router();

// Checkout works for guests and logged-in users alike (COD only, per spec).
router.post('/checkout', optionalAuth, validate({ body: checkoutSchema }), asyncHandler(checkoutHandler));

// Order history/detail/cancel require an account — guests track orders via
// the confirmation they received instead.
router.get('/mine', requireAuth, asyncHandler(listMyOrdersHandler));
router.get('/:id', requireAuth, validate({ params: orderIdParamSchema }), asyncHandler(getOrderHandler));
router.post('/:id/cancel', requireAuth, validate({ params: orderIdParamSchema }), asyncHandler(cancelOrderHandler));

export default router;
