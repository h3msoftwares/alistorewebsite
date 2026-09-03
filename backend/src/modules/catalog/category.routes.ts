import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  listCategoriesQuerySchema,
  categoryIdParamSchema,
  createCategorySchema,
  updateCategorySchema,
} from './category.schema';
import {
  listCategoriesHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} from './category.controller';

const router = Router();

// ---- Storefront (public) ----
// Optional ?collectionId= filters to one collection; the storefront nav
// renders the returned parent/children tree client-side.
router.get('/', validate({ query: listCategoriesQuerySchema }), asyncHandler(listCategoriesHandler));

// ---- Admin (STAFF/ADMIN only) ----
router.post(
  '/',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ body: createCategorySchema }),
  asyncHandler(createCategoryHandler)
);
router.patch(
  '/:id',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  asyncHandler(updateCategoryHandler)
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ params: categoryIdParamSchema }),
  asyncHandler(deleteCategoryHandler)
);

export default router;
