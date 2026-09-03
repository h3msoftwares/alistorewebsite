import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { createImageSchema, updateImageSchema } from './image.schema';
import {
  listCategoriesQuerySchema,
  categoryIdParamSchema,
  categoryImageParamSchema,
  createCategorySchema,
  updateCategorySchema,
} from './category.schema';
import {
  listCategoriesHandler,
  getCategoryHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
  addCategoryImageHandler,
  updateCategoryImageHandler,
  deleteCategoryImageHandler,
} from './category.controller';

const router = Router();

const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];

// ---- Storefront (public) ----
// Optional ?collectionId= filters to one collection; the storefront nav
// renders the returned parent/children tree client-side.
router.get('/', validate({ query: listCategoriesQuerySchema }), asyncHandler(listCategoriesHandler));
router.get('/:id', validate({ params: categoryIdParamSchema }), asyncHandler(getCategoryHandler));

// ---- Admin (STAFF/ADMIN only) ----
router.post('/', ...admin, validate({ body: createCategorySchema }), asyncHandler(createCategoryHandler));
router.patch(
  '/:id',
  ...admin,
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  asyncHandler(updateCategoryHandler)
);
router.delete(
  '/:id',
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
