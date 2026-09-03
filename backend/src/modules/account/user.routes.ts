import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { updateProfileSchema } from './user.schema';
import { getMeHandler, updateMeHandler } from './user.controller';

const router = Router();

router.use(requireAuth);

router.get('/me', asyncHandler(getMeHandler));
router.patch('/me', validate({ body: updateProfileSchema }), asyncHandler(updateMeHandler));

export default router;
