import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { saveSubscriptionSchema, deleteSubscriptionSchema } from './push.schema';
import { saveSubscriptionHandler, deleteSubscriptionHandler } from './push.controller';

// Mounted under admin.routes.ts, which already gates everything below it
// with requireAuth + requireRole('STAFF', 'ADMIN') — no per-route guard
// needed here.
const router = Router();

router.post('/', validate({ body: saveSubscriptionSchema }), asyncHandler(saveSubscriptionHandler));
router.delete('/', validate({ body: deleteSubscriptionSchema }), asyncHandler(deleteSubscriptionHandler));

export default router;
