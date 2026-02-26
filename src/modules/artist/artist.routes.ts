import { Router } from 'express';
import { jwtCheck } from '../../middleware/auth/auth0.middleware';
import { hydrateUser } from '../../middleware/auth/userHydration.middleware';
import { validate } from '../../middleware/validation/validate.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import * as artistController from './artist.controller';
import {
  createArtistSchema,
  updateArtistSchema,
  artistIdParamSchema,
} from './artist.schema';

const router = Router();

// Public: View by artistName
router.get('/:artistName', catchAsync(artistController.getProfileByName));

// Protected Routes
router.use(jwtCheck);
router.use(catchAsync(hydrateUser));

// Private/Admin/Manager: View by UUID
router.get(
  '/id/:id',
  validate(artistIdParamSchema, 'params'),
  catchAsync(artistController.getProfileById),
);

router.post(
  '/',
  validate(createArtistSchema, 'body'),
  catchAsync(artistController.createMyProfile),
);

// Update: Requires both the ID in params and data in body
router.patch(
  '/:id',
  validate(artistIdParamSchema, 'params'),
  validate(updateArtistSchema, 'body'),
  catchAsync(artistController.updateProfile),
);

export default router;
