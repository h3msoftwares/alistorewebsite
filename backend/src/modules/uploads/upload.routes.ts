import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requireAnyPermission } from '../../middleware/rbac.middleware';
import { getImageKitAuthHandler } from './upload.controller';

const router = Router();

// This token lets the browser write files into our ImageKit account, the
// same trust level as the catalog/settings write endpoints it feeds
// (product, category, collection image sub-resources, and settings logo/
// favicon uploads) — so it requires actually holding manage rights on at
// least one of those areas, not just any STAFF/ADMIN role. Without this, a
// STAFF account scoped to e.g. `analytics:view` only could still mint an
// upload credential and push arbitrary files into the store's ImageKit
// account (an availability/abuse surface, not a data leak).
router.get(
  '/imagekit-auth',
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  requireAnyPermission('products:manage', 'categories:manage', 'collections:manage', 'settings:manage'),
  asyncHandler(getImageKitAuthHandler)
);

export default router;
