import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { updateSettingsSchema } from './settings.schema';
import { getSettingsHandler, updateSettingsHandler } from './settings.controller';

const router = Router();

const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];

// Public — the storefront chrome reads this on every page.
router.get('/', asyncHandler(getSettingsHandler));

// Admin — the /admin/settings page.
router.patch('/', ...admin, validate({ body: updateSettingsSchema }), asyncHandler(updateSettingsHandler));

export default router;
