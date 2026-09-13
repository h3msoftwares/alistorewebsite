import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import { createLoyaltyRuleSchema, updateLoyaltyRuleSchema, loyaltyRuleIdParamSchema } from './loyalty.schema';
import {
  listLoyaltyRulesHandler,
  createLoyaltyRuleHandler,
  updateLoyaltyRuleHandler,
  deleteLoyaltyRuleHandler,
} from './loyalty.controller';

export function loyaltyRoutes(): Router {
  const router = Router();
  const admin = [requireAuth, requireRole('STAFF', 'ADMIN')];
  const canView = [...admin, requirePermission('loyalty:view')];
  const canManage = [...admin, requirePermission('loyalty:manage')];

  router.get('/loyalty-rules', ...canView, asyncHandler(listLoyaltyRulesHandler));
  router.post(
    '/loyalty-rules',
    ...canManage,
    validate({ body: createLoyaltyRuleSchema }),
    asyncHandler(createLoyaltyRuleHandler)
  );
  router.patch(
    '/loyalty-rules/:id',
    ...canManage,
    validate({ params: loyaltyRuleIdParamSchema, body: updateLoyaltyRuleSchema }),
    asyncHandler(updateLoyaltyRuleHandler)
  );
  router.delete(
    '/loyalty-rules/:id',
    ...canManage,
    validate({ params: loyaltyRuleIdParamSchema }),
    asyncHandler(deleteLoyaltyRuleHandler)
  );

  return router;
}
