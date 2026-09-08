import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  listProductsQuerySchema,
  productIdParamSchema,
  productImageParamSchema,
  productVariantParamSchema,
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  createProductImageSchema,
  updateProductImageSchema,
} from './product.schema';
import {
  listProductsHandler,
  getProductHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
  restoreProductHandler,
  hardDeleteProductHandler,
  addVariantHandler,
  updateVariantHandler,
  deleteVariantHandler,
  addProductImageHandler,
  updateProductImageHandler,
  deleteProductImageHandler,
} from './product.controller';

const router = Router();

const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];
// S4: a permanent (hard) delete is irreversible — ADMIN only. The soft-delete
// (`DELETE /:id`) and everything else stays STAFF-reachable.
const adminOnly = [requireAuth, requireRole('ADMIN')];

// ---- Storefront (public; optionalAuth lets staff pass ?status=archived|all) ----
router.get(
  '/',
  optionalAuth,
  validate({ query: listProductsQuerySchema }),
  asyncHandler(listProductsHandler)
);
router.get(
  '/:id',
  optionalAuth,
  validate({ params: productIdParamSchema }),
  asyncHandler(getProductHandler)
);

// ---- Admin (STAFF/ADMIN only) ----
router.post('/', ...admin, validate({ body: createProductSchema }), asyncHandler(createProductHandler));
router.patch(
  '/:id',
  ...admin,
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  asyncHandler(updateProductHandler)
);
// DELETE /:id archives (soft-delete). Restore + permanent delete follow.
router.delete(
  '/:id',
  ...admin,
  validate({ params: productIdParamSchema }),
  asyncHandler(deleteProductHandler)
);
router.post(
  '/:id/restore',
  ...admin,
  validate({ params: productIdParamSchema }),
  asyncHandler(restoreProductHandler)
);
router.delete(
  '/:id/permanent',
  ...adminOnly,
  validate({ params: productIdParamSchema }),
  asyncHandler(hardDeleteProductHandler)
);

// ---- Variants ----
router.post(
  '/:id/variants',
  ...admin,
  validate({ params: productIdParamSchema, body: createVariantSchema }),
  asyncHandler(addVariantHandler)
);
router.patch(
  '/:id/variants/:variantId',
  ...admin,
  validate({ params: productVariantParamSchema, body: updateVariantSchema }),
  asyncHandler(updateVariantHandler)
);
router.delete(
  '/:id/variants/:variantId',
  ...admin,
  validate({ params: productVariantParamSchema }),
  asyncHandler(deleteVariantHandler)
);

// ---- Images ----
router.post(
  '/:id/images',
  ...admin,
  validate({ params: productIdParamSchema, body: createProductImageSchema }),
  asyncHandler(addProductImageHandler)
);
router.patch(
  '/:id/images/:imageId',
  ...admin,
  validate({ params: productImageParamSchema, body: updateProductImageSchema }),
  asyncHandler(updateProductImageHandler)
);
router.delete(
  '/:id/images/:imageId',
  ...admin,
  validate({ params: productImageParamSchema }),
  asyncHandler(deleteProductImageHandler)
);

export default router;
