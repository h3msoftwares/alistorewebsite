import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { createImageSchema, updateImageSchema } from './image.schema';
import { listProductsQuerySchema } from './product.schema';
import {
  listCategoriesQuerySchema,
  categoryIdParamSchema,
  categorySlugParamSchema,
  categoryImageParamSchema,
  createCategorySchema,
  updateCategorySchema,
} from './category.schema';
import {
  listCategoriesHandler,
  getCategoryHandler,
  getCategoryBySlugHandler,
  listCategoryProductsHandler,
  createCategoryHandler,
  updateCategoryHandler,
  archiveCategoryHandler,
  restoreCategoryHandler,
  deleteCategoryHandler,
  addCategoryImageHandler,
  updateCategoryImageHandler,
  deleteCategoryImageHandler,
} from './category.controller';

const router = Router();

const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];

// ---- Storefront (public) ----
// Optional ?collectionId= filters to one collection; ?standalone=true returns
// only categories attached to no collection. The storefront nav renders the
// returned parent/children tree client-side.
router.get(
  '/',
  optionalAuth,
  validate({ query: listCategoriesQuerySchema }),
  asyncHandler(listCategoriesHandler)
);
router.get(
  '/slug/:slug',
  validate({ params: categorySlugParamSchema }),
  asyncHandler(getCategoryBySlugHandler)
);
router.get('/:id', validate({ params: categoryIdParamSchema }), asyncHandler(getCategoryHandler));
// Products preview — same shape as GET /api/products, scoped to this category.
router.get(
  '/:id/products',
  validate({ params: categoryIdParamSchema, query: listProductsQuerySchema }),
  asyncHandler(listCategoryProductsHandler)
);

// ---- Admin (STAFF/ADMIN only) ----
router.post('/', ...admin, validate({ body: createCategorySchema }), asyncHandler(createCategoryHandler));
router.patch(
  '/:id',
  ...admin,
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  asyncHandler(updateCategoryHandler)
);
// DELETE /:id archives; restore + permanent delete are their own routes.
router.delete(
  '/:id',
  ...admin,
  validate({ params: categoryIdParamSchema }),
  asyncHandler(archiveCategoryHandler)
);
router.post(
  '/:id/restore',
  ...admin,
  validate({ params: categoryIdParamSchema }),
  asyncHandler(restoreCategoryHandler)
);
router.delete(
  '/:id/permanent',
  ...admin,
  validate({ params: categoryIdParamSchema }),
  asyncHandler(deleteCategoryHandler)
);

// ---- Images ----
router.post(
  '/:id/images',
  ...admin,
  validate({ params: categoryIdParamSchema, body: createImageSchema }),
  asyncHandler(addCategoryImageHandler)
);
router.patch(
  '/:id/images/:imageId',
  ...admin,
  validate({ params: categoryImageParamSchema, body: updateImageSchema }),
  asyncHandler(updateCategoryImageHandler)
);
router.delete(
  '/:id/images/:imageId',
  ...admin,
  validate({ params: categoryImageParamSchema }),
  asyncHandler(deleteCategoryImageHandler)
);

export default router;
