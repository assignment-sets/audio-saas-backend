import { Router } from 'express';
import { jwtCheck } from '../../middleware/auth/auth0.middleware';
import { hydrateUser } from '../../middleware/auth/userHydration.middleware';
import { validate } from '../../middleware/validation/validate.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import * as artistController from './artist.controller';
import {
  createArtistSchema,
  updateArtistSchema,
  getArtistByIdSchema,
} from './artist.schema';

const router = Router();

// Public: View by artistName (e.g., /api/artists/skrillex)
router.get('/:artistName', catchAsync(artistController.getProfileByName));

// Protected Routes
router.use(jwtCheck);
router.use(catchAsync(hydrateUser));

// Private: View by UUID (Internal/App use)
router.get(
  '/id/:id',
  validate(getArtistByIdSchema, 'params'),
  catchAsync(artistController.getProfileById),
);

router.post(
  '/',
  validate(createArtistSchema),
  catchAsync(artistController.createMyProfile),
);

router.patch(
  '/',
  validate(updateArtistSchema),
  catchAsync(artistController.updateMyProfile),
);

export default router;
