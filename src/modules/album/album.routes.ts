import './album.openapi';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth/requireAuth.middleware';
import { optionalAuth } from '../../middleware/auth/optionalAuth.middleware';
import { validate } from '../../middleware/validation/validate.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import * as albumController from './album.controller';
import {
  albumIdParamSchema,
  artistIdParamSchema,
  createAlbumSchema,
  updateAlbumSchema,
  getAlbumsByArtistQuerySchema,
} from './album.schema';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Get all albums for an artist (dynamic draft visibility based on requester manager auth status, supports cursor pagination)
router.get(
  '/artist/:artistId',
  validate(artistIdParamSchema, 'params'),
  validate(getAlbumsByArtistQuerySchema, 'query'),
  catchAsync(optionalAuth),
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
router.use(requireAuth);

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
