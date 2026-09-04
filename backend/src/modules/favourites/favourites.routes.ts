import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import { addFavouriteSchema, favouriteProductIdParamSchema } from './favourites.schema';
import {
  listFavouritesHandler,
  addFavouriteHandler,
  removeFavouriteHandler,
} from './favourites.controller';

const router = Router();

// Every favourites route is scoped to the logged-in user — same as
// /api/addresses. Guests keep their hearts client-side (favouritesSlice +
// localStorage), so there's no guest/session path here.
router.use(requireAuth);

router.get('/', asyncHandler(listFavouritesHandler));
router.post('/', validate({ body: addFavouriteSchema }), asyncHandler(addFavouriteHandler));
router.delete(
  '/:productID',
  validate({ params: favouriteProductIdParamSchema }),
  asyncHandler(removeFavouriteHandler)
);

export default router;
