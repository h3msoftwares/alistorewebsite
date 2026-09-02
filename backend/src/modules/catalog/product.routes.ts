import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  listProductsQuerySchema,
  productIdParamSchema,
  createProductSchema,
  updateProductSchema,
} from './product.schema';
import {
  listProductsHandler,
  getProductHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
} from './product.controller';

const router = Router();

// ---- Storefront (public) ----
router.get('/', validate({ query: listProductsQuerySchema }), asyncHandler(listProductsHandler));
router.get('/:id', validate({ params: productIdParamSchema }), asyncHandler(getProductHandler));

// ---- Admin (STAFF/ADMIN only) ----
router.post(
  '/',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ body: createProductSchema }),
  asyncHandler(createProductHandler)
);
router.patch(
  '/:id',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  asyncHandler(updateProductHandler)
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ params: productIdParamSchema }),
  asyncHandler(deleteProductHandler)
);

export default router;
