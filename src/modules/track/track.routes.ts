import { Router } from 'express';
import { jwtCheck } from '../../middleware/auth/auth0.middleware';
import { hydrateUser } from '../../middleware/auth/userHydration.middleware';
import { optionalAuth } from '../../middleware/auth/optionalAuth.middleware';
import { validate } from '../../middleware/validation/validate.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import * as trackController from './track.controller';
import {
  createTrackSchema,
  updateTrackSchema,
  trackIdParamSchema,
  artistIdParamSchema,
  trackPlaySchema,
  generateUploadUrlSchema,
  transcodeWebhookSchema,
  batchPlaysWebhookSchema,
  getTracksByArtistQuerySchema,
  getTracksDashboardQuerySchema,
} from './track.schema';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Fetch all ready tracks for an artist (supports guest and cursor pagination)
router.get(
  '/artist/:artistId',
  validate(artistIdParamSchema, 'params'),
  validate(getTracksByArtistQuerySchema, 'query'),
  catchAsync(optionalAuth),
  catchAsync(trackController.getTracksByArtist),
);

router.post(
  '/webhook/transcode',
  validate(transcodeWebhookSchema),
  catchAsync(trackController.handleTranscodeWebhook),
);

router.post(
  '/webhook/batch-plays',
  validate(batchPlaysWebhookSchema),
  catchAsync(trackController.handleBatchPlaysWebhook),
);

// Record a play (Handles both public stats and user history)
router.post(
  '/:id/play',
  validate(trackIdParamSchema, 'params'),
  validate(trackPlaySchema, 'body'),
  catchAsync(optionalAuth),
  catchAsync(trackController.recordPlay),
);

// ==========================================
// PROTECTED ROUTES
// ==========================================
router.use(jwtCheck);
router.use(catchAsync(hydrateUser));

// Fetch all tracks for artist dashboard (regardless of state, requires can_manage)
router.get(
  '/artist/:artistId/dashboard',
  validate(artistIdParamSchema, 'params'),
  validate(getTracksDashboardQuerySchema, 'query'),
  catchAsync(trackController.getTracksByArtistDashboard),
);

// Fetch a single track's metadata (Private dashboard view)
router.get(
  '/:id',
  validate(trackIdParamSchema, 'params'),
  catchAsync(trackController.getTrackById),
);

// Track Management (Artists / Managers)
router.post(
  '/',
  validate(createTrackSchema, 'body'),
  catchAsync(trackController.createTrack),
);

router.patch(
  '/:id',
  validate(trackIdParamSchema, 'params'),
  validate(updateTrackSchema, 'body'),
  catchAsync(trackController.updateTrack),
);

router.delete(
  '/:id',
  validate(trackIdParamSchema, 'params'),
  catchAsync(trackController.deleteTrack),
);

// Social Interactions (Listeners)
router.post(
  '/:id/like',
  validate(trackIdParamSchema, 'params'),
  catchAsync(trackController.likeTrack),
);

router.delete(
  '/:id/like',
  validate(trackIdParamSchema, 'params'),
  catchAsync(trackController.unlikeTrack),
);

router.post(
  '/upload-url',
  validate(generateUploadUrlSchema, 'body'),
  catchAsync(trackController.generateUploadUrl),
);

export default router;
