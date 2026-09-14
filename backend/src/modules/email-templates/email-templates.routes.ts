import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import {
  emailTemplateKeyParamSchema,
  updateEmailTemplateSchema,
  sendTestEmailSchema,
} from './email-templates.schema';
import {
  listEmailTemplatesHandler,
  getEmailTemplateHandler,
  updateEmailTemplateHandler,
  resetEmailTemplateHandler,
  sendTestEmailHandler,
} from './email-templates.controller';

const router = Router();

// Reuses "settings:manage" rather than a new permission key — this is
// admin-editable site content in the same sense SiteSetting is, and adding
// a fresh RBAC permission string is a data migration for every existing
// Role.permissions row for zero real benefit (same reasoning promotion.routes
// applies to keeping the old "discounts:*" keys after the Promotion rename).
const admin = [requireAuth, requireRole('STAFF', 'ADMIN'), requirePermission('settings:manage')];

router.get('/', ...admin, asyncHandler(listEmailTemplatesHandler));
router.get(
  '/:key',
  ...admin,
  validate({ params: emailTemplateKeyParamSchema }),
  asyncHandler(getEmailTemplateHandler)
);
router.put(
  '/:key',
  ...admin,
  validate({ params: emailTemplateKeyParamSchema, body: updateEmailTemplateSchema }),
  asyncHandler(updateEmailTemplateHandler)
);
router.post(
  '/:key/reset',
  ...admin,
  validate({ params: emailTemplateKeyParamSchema }),
  asyncHandler(resetEmailTemplateHandler)
);
router.post(
  '/:key/test',
  ...admin,
  validate({ params: emailTemplateKeyParamSchema, body: sendTestEmailSchema }),
  asyncHandler(sendTestEmailHandler)
);

export default router;
