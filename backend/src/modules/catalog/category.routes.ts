import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { listCategoriesHandler } from './category.controller';

const router = Router();

// Only top-level filtering (by department) is exposed here — the storefront
// nav renders the returned parent/children tree client-side.
router.get('/', asyncHandler(listCategoriesHandler));

export default router;
