import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { getImageKitAuthHandler } from './upload.controller';

const router = Router();

// Admin-only — this token lets the browser write files into our ImageKit
// account, the same trust level as the catalog write endpoints it feeds
// (collection/category/product image sub-resources).
router.get(
  '/imagekit-auth',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  asyncHandler(getImageKitAuthHandler)
);

export default router;
