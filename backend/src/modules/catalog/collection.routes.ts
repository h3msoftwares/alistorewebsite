import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import { createImageSchema, updateImageSchema } from './image.schema';
import {
  listCollectionsQuerySchema,
  collectionIdParamSchema,
  collectionSlugParamSchema,
  collectionImageParamSchema,
  createCollectionSchema,
  updateCollectionSchema,
  setCollectionProductsSchema,
  setCollectionRulesSchema,
} from './collection.schema';
import {
  listCollectionsHandler,
  getCollectionHandler,
  getCollectionBySlugHandler,
  listCollectionProductsHandler,
  createCollectionHandler,
  updateCollectionHandler,
  archiveCollectionHandler,
  restoreCollectionHandler,
  deleteCollectionHandler,
  setCollectionProductsHandler,
  setCollectionRulesHandler,
  addCollectionImageHandler,
  updateCollectionImageHandler,
  deleteCollectionImageHandler,
} from './collection.controller';

const router = Router();

const admin = [requireAuth, requireRole('STAFF', 'ADMIN'), requirePermission('collections:manage')];

// ---- Storefront (public; optionalAuth lets staff pass ?status=archived|all) ----
router.get(
  '/',
  optionalAuth,
  validate({ query: listCollectionsQuerySchema }),
  asyncHandler(listCollectionsHandler)
);
router.get(
  '/slug/:slug',
  validate({ params: collectionSlugParamSchema }),
  asyncHandler(getCollectionBySlugHandler)
);
router.get('/:id', validate({ params: collectionIdParamSchema }), asyncHandler(getCollectionHandler));
// Live product listing — manual, automated, or hybrid depending on the
// collection's `type` (see collection-rules.ts).
router.get(
  '/:id/products',
  validate({ params: collectionIdParamSchema }),
  asyncHandler(listCollectionProductsHandler)
);

// ---- Admin (STAFF/ADMIN only) ----
router.post('/', ...admin, validate({ body: createCollectionSchema }), asyncHandler(createCollectionHandler));
router.patch(
  '/:id',
  ...admin,
  validate({ params: collectionIdParamSchema, body: updateCollectionSchema }),
  asyncHandler(updateCollectionHandler)
);
// DELETE /:id archives (the primary "remove"). Restore + permanent delete
// are their own routes below.
router.delete(
  '/:id',
  ...admin,
  validate({ params: collectionIdParamSchema }),
  asyncHandler(archiveCollectionHandler)
);
router.post(
  '/:id/restore',
  ...admin,
  validate({ params: collectionIdParamSchema }),
  asyncHandler(restoreCollectionHandler)
);
router.delete(
  '/:id/permanent',
  ...admin,
  validate({ params: collectionIdParamSchema }),
  asyncHandler(deleteCollectionHandler)
);

// Replace this collection's manual product membership wholesale (MANUAL/HYBRID).
router.put(
  '/:id/products',
  ...admin,
  validate({ params: collectionIdParamSchema, body: setCollectionProductsSchema }),
  asyncHandler(setCollectionProductsHandler)
);

// Replace this collection's rules wholesale (AUTOMATED/HYBRID).
router.put(
  '/:id/rules',
  ...admin,
  validate({ params: collectionIdParamSchema, body: setCollectionRulesSchema }),
  asyncHandler(setCollectionRulesHandler)
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
