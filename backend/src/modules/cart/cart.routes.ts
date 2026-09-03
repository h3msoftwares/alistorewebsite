import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { optionalAuth } from '../../middleware/auth.middleware';
import { addCartItemSchema, updateCartItemSchema, cartItemParamSchema } from './cart.schema';
import {
  getCartHandler,
  addCartItemHandler,
  updateCartItemHandler,
  removeCartItemHandler,
  clearCartHandler,
} from './cart.controller';

const router = Router();

// Every route works for both guests and logged-in users — optionalAuth
// resolves whichever applies, per the requirement that guest checkout stays
// available alongside accounts.
router.use(optionalAuth);

router.get('/', asyncHandler(getCartHandler));
router.post('/items', validate({ body: addCartItemSchema }), asyncHandler(addCartItemHandler));
router.patch(
  '/items/:itemId',
  validate({ params: cartItemParamSchema, body: updateCartItemSchema }),
  asyncHandler(updateCartItemHandler)
);
router.delete('/items/:itemId', validate({ params: cartItemParamSchema }), asyncHandler(removeCartItemHandler));
router.delete('/', asyncHandler(clearCartHandler));

export default router;
