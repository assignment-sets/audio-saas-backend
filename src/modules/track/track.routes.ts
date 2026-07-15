import { Router } from 'express';
import { requireAuth } from '../../middleware/auth/requireAuth.middleware';
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
import { createRateLimiter } from '../../middleware/rateLimit/rateLimiter.middleware';

const uploadUrlRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyPrefix: 'upload-url',
});

const playRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyPrefix: 'play',
});

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
  catchAsync(playRateLimiter),
  catchAsync(trackController.recordPlay),
);

// ==========================================
// PROTECTED ROUTES
// ==========================================
router.use(requireAuth);

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
  catchAsync(uploadUrlRateLimiter),
  validate(generateUploadUrlSchema, 'body'),
  catchAsync(trackController.generateUploadUrl),
);

export default router;
