import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate.middleware';
import { requireAuth } from '../../middleware/auth.middleware';
import {
  createAddressSchema,
  updateAddressSchema,
  addressIdParamSchema,
} from './address.schema';
import {
  listAddressesHandler,
  getAddressHandler,
  createAddressHandler,
  updateAddressHandler,
  deleteAddressHandler,
} from './address.controller';

const router = Router();

// Every address route is scoped to the logged-in user.
router.use(requireAuth);

router.get('/', asyncHandler(listAddressesHandler));
router.get('/:id', validate({ params: addressIdParamSchema }), asyncHandler(getAddressHandler));
router.post('/', validate({ body: createAddressSchema }), asyncHandler(createAddressHandler));
router.patch(
  '/:id',
  validate({ params: addressIdParamSchema, body: updateAddressSchema }),
  asyncHandler(updateAddressHandler)
);
router.delete('/:id', validate({ params: addressIdParamSchema }), asyncHandler(deleteAddressHandler));

export default router;
