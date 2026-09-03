import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { createImageSchema, updateImageSchema } from './image.schema';
import {
  listCollectionsQuerySchema,
  collectionIdParamSchema,
  collectionSlugParamSchema,
  collectionImageParamSchema,
  createCollectionSchema,
  updateCollectionSchema,
  linkCategoriesSchema,
} from './collection.schema';
import {
  listCollectionsHandler,
  getCollectionHandler,
  getCollectionBySlugHandler,
  createCollectionHandler,
  updateCollectionHandler,
  deleteCollectionHandler,
  linkCategoriesHandler,
  addCollectionImageHandler,
  updateCollectionImageHandler,
  deleteCollectionImageHandler,
} from './collection.controller';

const router = Router();

const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];

// ---- Storefront (public) ----
router.get('/', validate({ query: listCollectionsQuerySchema }), asyncHandler(listCollectionsHandler));
router.get(
  '/slug/:slug',
  validate({ params: collectionSlugParamSchema }),
  asyncHandler(getCollectionBySlugHandler)
);
router.get('/:id', validate({ params: collectionIdParamSchema }), asyncHandler(getCollectionHandler));

// ---- Admin (STAFF/ADMIN only) ----
router.post('/', ...admin, validate({ body: createCollectionSchema }), asyncHandler(createCollectionHandler));
router.patch(
  '/:id',
  ...admin,
  validate({ params: collectionIdParamSchema, body: updateCollectionSchema }),
  asyncHandler(updateCollectionHandler)
);
router.delete(
  '/:id',
  ...admin,
  validate({ params: collectionIdParamSchema }),
  asyncHandler(deleteCollectionHandler)
);

// Link existing categories into this collection (moves them here).
router.post(
  '/:id/categories',
  ...admin,
  validate({ params: collectionIdParamSchema, body: linkCategoriesSchema }),
  asyncHandler(linkCategoriesHandler)
);

// ---- Images ----
router.post(
  '/:id/images',
  ...admin,
  validate({ params: collectionIdParamSchema, body: createImageSchema }),
  asyncHandler(addCollectionImageHandler)
);
router.patch(
  '/:id/images/:imageId',
  ...admin,
  validate({ params: collectionImageParamSchema, body: updateImageSchema }),
  asyncHandler(updateCollectionImageHandler)
);
router.delete(
  '/:id/images/:imageId',
  ...admin,
  validate({ params: collectionImageParamSchema }),
  asyncHandler(deleteCollectionImageHandler)
);

export default router;
