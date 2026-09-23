import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import {
  createComboRuleSchema,
  updateComboRuleSchema,
  comboRuleIdParamSchema,
  previewComboCoverageSchema,
} from './combo-rule.schema';
import {
  listComboRulesHandler,
  getComboRuleHandler,
  createComboRuleHandler,
  updateComboRuleHandler,
  deleteComboRuleHandler,
  previewComboCoverageHandler,
} from './combo-rule.controller';

/**
 * Admin-only — no public storefront endpoint (unlike promotionRoutes'
 * public coupon-validate route): combo pricing is applied automatically at
 * cart/checkout time, there's no customer-supplied code to check. Gated on
 * its own `combos:*` permission area (backend/src/lib/permissions.ts),
 * deliberately NOT `discounts:*` — see the design plan on why reusing an
 * existing permission key is a migration hazard.
 */
export function comboRuleRoutes(): Router {
  const router = Router();
  const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];
  const canView = [...admin, requirePermission('combos:view')];
  const canManage = [...admin, requirePermission('combos:manage')];

  router.get('/combo-rules', ...canView, asyncHandler(listComboRulesHandler));
  router.get(
    '/combo-rules/:id',
    ...canView,
    validate({ params: comboRuleIdParamSchema }),
    asyncHandler(getComboRuleHandler)
  );
  router.post(
    '/combo-rules',
    ...canManage,
    validate({ body: createComboRuleSchema }),
    asyncHandler(createComboRuleHandler)
  );
  // Read-only: "which live products would this (possibly still-unsaved)
  // target set cover" — mirrors promotionRoutes' preview-coverage route.
  router.post(
    '/combo-rules/preview-coverage',
    ...canView,
    validate({ body: previewComboCoverageSchema }),
    asyncHandler(previewComboCoverageHandler)
  );
  router.patch(
    '/combo-rules/:id',
    ...canManage,
    validate({ params: comboRuleIdParamSchema, body: updateComboRuleSchema }),
    asyncHandler(updateComboRuleHandler)
  );
  router.delete(
    '/combo-rules/:id',
    ...canManage,
    validate({ params: comboRuleIdParamSchema }),
    asyncHandler(deleteComboRuleHandler)
  );

  return router;
}
