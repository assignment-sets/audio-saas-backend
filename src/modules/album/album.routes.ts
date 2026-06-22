import { Router } from 'express';
import { jwtCheck } from '../../middleware/auth/auth0.middleware';
import { hydrateUser } from '../../middleware/auth/userHydration.middleware';
import { optionalAuth } from '../../middleware/auth/optionalAuth.middleware';
import { validate } from '../../middleware/validation/validate.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import * as albumController from './album.controller';
import {
  albumIdParamSchema,
  artistIdParamSchema,
  createAlbumSchema,
  updateAlbumSchema,
} from './album.schema';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Get all published albums for an artist
router.get(
  '/artist/:artistId',
  validate(artistIdParamSchema, 'params'),
  catchAsync(albumController.getAlbumsByArtist),
);

// Get single album details (Handles both public visitors and authenticated creators)
router.get(
  '/:id',
  validate(albumIdParamSchema, 'params'),
  catchAsync(optionalAuth),
  catchAsync(albumController.getAlbumById),
);

// ==========================================
// PROTECTED ROUTES
// ==========================================
router.use(jwtCheck);
router.use(catchAsync(hydrateUser));

// Get all albums for an artist (including DRAFT, private view for manager)
router.get(
  '/artist/:artistId/pvt',
  validate(artistIdParamSchema, 'params'),
  catchAsync(albumController.getAlbumsByArtistPrivate),
);

// Create a new album (DRAFT)
router.post(
  '/',
  validate(createAlbumSchema, 'body'),
  catchAsync(albumController.createAlbum),
);

// Update album metadata and/or manage tracklist
router.patch(
  '/:id',
  validate(albumIdParamSchema, 'params'),
  validate(updateAlbumSchema, 'body'),
  catchAsync(albumController.updateAlbum),
);

// Publish the album (performs guardrail validations)
router.post(
  '/:id/publish',
  validate(albumIdParamSchema, 'params'),
  catchAsync(albumController.publishAlbum),
);

// Delete the album
router.delete(
  '/:id',
  validate(albumIdParamSchema, 'params'),
  catchAsync(albumController.deleteAlbum),
);

export default router;
