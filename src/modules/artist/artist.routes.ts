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
  getFollowersQuerySchema,
} from './artist.schema';

const router = Router();

// Public: View list of followers for an artist
router.get(
  '/:id/followers',
  validate(artistIdParamSchema, 'params'),
  validate(getFollowersQuerySchema, 'query'),
  catchAsync(artistController.getArtistFollowers),
);

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

// Social Interactions (Follow/Unfollow)
router.post(
  '/:id/follow',
  validate(artistIdParamSchema, 'params'),
  catchAsync(artistController.followArtist),
);

router.delete(
  '/:id/follow',
  validate(artistIdParamSchema, 'params'),
  catchAsync(artistController.unfollowArtist),
);

router.get(
  '/:id/following',
  validate(artistIdParamSchema, 'params'),
  catchAsync(artistController.getFollowingStatus),
);

export default router;
