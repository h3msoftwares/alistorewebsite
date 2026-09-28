import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { requirePermission, requireRole } from '../../middleware/rbac.middleware';
import { paramString } from '../../lib/params';
import { bundleIdSchema, createBundleSchema, updateBundleSchema } from './bundle.schema';
import * as service from './bundle.service';

export function bundleRoutes() {
  const router = Router();
  const admin = [requireAuth, requireRole('ADMIN', 'STAFF')];
  router.get('/bundles', ...admin, requirePermission('bundles:view'), asyncHandler(async (_req, res) => { res.json({ bundles: await service.listBundles() }); }));
  router.get('/bundles/:id', ...admin, requirePermission('bundles:view'), validate({ params: bundleIdSchema }), asyncHandler(async (req, res) => { res.json({ bundle: await service.getBundle(paramString(req.params.id)) }); }));
  router.post('/bundles', ...admin, requirePermission('bundles:manage'), validate({ body: createBundleSchema }), asyncHandler(async (req, res) => { res.status(201).json({ bundle: await service.createBundle(req.body, req.user!.id) }); }));
  router.patch('/bundles/:id', ...admin, requirePermission('bundles:manage'), validate({ params: bundleIdSchema, body: updateBundleSchema }), asyncHandler(async (req, res) => { res.json({ bundle: await service.updateBundle(paramString(req.params.id), req.body, req.user!.id) }); }));
  router.delete('/bundles/:id', ...admin, requirePermission('bundles:manage'), validate({ params: bundleIdSchema }), asyncHandler(async (req, res) => { await service.deleteBundle(paramString(req.params.id), req.user!.id); res.status(204).end(); }));
  return router;
}
