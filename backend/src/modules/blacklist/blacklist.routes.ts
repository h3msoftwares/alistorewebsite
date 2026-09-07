import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { createBlacklistEntrySchema, blacklistIdParamSchema } from './blacklist.schema';
import { listBlacklistHandler, createBlacklistHandler, deleteBlacklistHandler } from './blacklist.controller';

// Mounted under admin.routes.ts, which already gates everything below it
// with requireAuth + requireRole('STAFF', 'ADMIN') — no per-route guard
// needed here.
const router = Router();

router.get('/', asyncHandler(listBlacklistHandler));
router.post('/', validate({ body: createBlacklistEntrySchema }), asyncHandler(createBlacklistHandler));
router.delete('/:id', validate({ params: blacklistIdParamSchema }), asyncHandler(deleteBlacklistHandler));

export default router;
