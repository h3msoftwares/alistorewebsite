import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import {
  listCollectionsQuerySchema,
  collectionIdParamSchema,
  createCollectionSchema,
  updateCollectionSchema,
  linkCategoriesSchema,
} from './collection.schema';
import {
  listCollectionsHandler,
  getCollectionHandler,
  createCollectionHandler,
  updateCollectionHandler,
  deleteCollectionHandler,
  linkCategoriesHandler,
} from './collection.controller';

const router = Router();

// ---- Storefront (public) ----
router.get('/', validate({ query: listCollectionsQuerySchema }), asyncHandler(listCollectionsHandler));
router.get('/:id', validate({ params: collectionIdParamSchema }), asyncHandler(getCollectionHandler));

// ---- Admin (STAFF/ADMIN only) ----
router.post(
  '/',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ body: createCollectionSchema }),
  asyncHandler(createCollectionHandler)
);
router.patch(
  '/:id',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ params: collectionIdParamSchema, body: updateCollectionSchema }),
  asyncHandler(updateCollectionHandler)
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ params: collectionIdParamSchema }),
  asyncHandler(deleteCollectionHandler)
);

// Link existing categories into this collection (moves them here).
router.post(
  '/:id/categories',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  validate({ params: collectionIdParamSchema, body: linkCategoriesSchema }),
  asyncHandler(linkCategoriesHandler)
);

export default router;
