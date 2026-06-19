import { Router } from 'express';
import { jwtCheck } from '../../middleware/auth/auth0.middleware';
import { hydrateUser } from '../../middleware/auth/userHydration.middleware';
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

// Record a play (Public, unauthenticated)
router.post(
  '/:id/play',
  validate(trackIdParamSchema, 'params'),
  validate(trackPlaySchema, 'body'),
  catchAsync(trackController.recordPlayPublic),
);

// ==========================================
// PROTECTED ROUTES
// ==========================================
router.use(jwtCheck);
router.use(catchAsync(hydrateUser));

// Fetch all ready tracks for an artist (Authenticated/Private view with like status)
router.get(
  '/artist/:artistId/pvt',
  validate(artistIdParamSchema, 'params'),
  catchAsync(trackController.getTracksByArtistAuthenticated),
);

// Fetch a single track's metadata (Private dashboard view)
router.get(
  '/:id',
  validate(trackIdParamSchema, 'params'),
  catchAsync(trackController.getTrackById),
);

// Record a play (Private, requires signed-in user)
router.post(
  '/:id/play/pvt',
  validate(trackIdParamSchema, 'params'),
  validate(trackPlaySchema, 'body'),
  catchAsync(trackController.recordPlayAuthenticated),
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
