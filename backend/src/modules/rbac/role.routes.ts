import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requireRole, requirePermission } from '../../middleware/rbac.middleware';
import {
  createRoleSchema,
  updateRoleSchema,
  roleIdParamSchema,
  assignRoleSchema,
  setRevokedSchema,
  createTeamMemberSchema,
  updateTeamMemberSchema,
  teamMemberIdParamSchema,
} from './role.schema';
import {
  permissionCatalogHandler,
  listRolesHandler,
  createRoleHandler,
  updateRoleHandler,
  deleteRoleHandler,
  listTeamHandler,
  assignRoleHandler,
  setRevokedHandler,
  createTeamMemberHandler,
  updateTeamMemberHandler,
} from './role.controller';

const router = Router();

// Coarse gate for the whole subtree; per-route permission checks below.
router.use(requireAuth, requireRole('STAFF', 'ADMIN'));

const canView = requirePermission('roles:view');
const canManage = requirePermission('roles:manage');

// The permission catalog that drives the roles-page matrix.
router.get('/permissions', canView, asyncHandler(permissionCatalogHandler));

// Roles CRUD.
router.get('/roles', canView, asyncHandler(listRolesHandler));
router.post('/roles', canManage, validate({ body: createRoleSchema }), asyncHandler(createRoleHandler));
router.patch(
  '/roles/:id',
  canManage,
  validate({ params: roleIdParamSchema, body: updateRoleSchema }),
  asyncHandler(updateRoleHandler)
);
router.delete(
  '/roles/:id',
  canManage,
  validate({ params: roleIdParamSchema }),
  asyncHandler(deleteRoleHandler)
);

// Team: create accounts, assign roles, revoke permissions, toggle access.
router.get('/team', canView, asyncHandler(listTeamHandler));
router.post('/team', canManage, validate({ body: createTeamMemberSchema }), asyncHandler(createTeamMemberHandler));
router.patch(
  '/team/:id',
  canManage,
  validate({ params: teamMemberIdParamSchema, body: updateTeamMemberSchema }),
  asyncHandler(updateTeamMemberHandler)
);
router.post('/team/assign-role', canManage, validate({ body: assignRoleSchema }), asyncHandler(assignRoleHandler));
router.post('/team/revoke', canManage, validate({ body: setRevokedSchema }), asyncHandler(setRevokedHandler));

export default router;
