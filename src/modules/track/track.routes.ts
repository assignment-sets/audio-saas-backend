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
} from './track.schema';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Fetch all ready tracks for an artist
router.get(
  '/artist/:artistId',
  validate(artistIdParamSchema, 'params'),
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
