import './playlist.openapi';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth/requireAuth.middleware';
import { optionalAuth } from '../../middleware/auth/optionalAuth.middleware';
import { validate } from '../../middleware/validation/validate.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import * as playlistController from './playlist.controller';
import {
  playlistIdParamSchema,
  playlistAndTrackParamSchema,
  createPlaylistSchema,
  updatePlaylistSchema,
  addTracksSchema,
  playlistSearchQuerySchema,
  playlistUserParamsSchema,
  playlistUserQuerySchema,
} from './playlist.schema';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Get playlist by ID (Handles public visitors and authenticated members can_view authorization check)
router.get(
  '/:id',
  validate(playlistIdParamSchema, 'params'),
  catchAsync(optionalAuth),
  catchAsync(playlistController.getPlaylistById),
);

// Search playlists by name (Supports guest access)
router.get(
  '/',
  validate(playlistSearchQuerySchema, 'query'),
  catchAsync(optionalAuth),
  catchAsync(playlistController.searchPlaylists),
);

// Get playlists of a specific user (Supports guest access)
router.get(
  '/user/:userId',
  validate(playlistUserParamsSchema, 'params'),
  validate(playlistUserQuerySchema, 'query'),
  catchAsync(optionalAuth),
  catchAsync(playlistController.getUserPlaylists),
);

// ==========================================
// PROTECTED ROUTES
// ==========================================
router.use(requireAuth);

// Create a new playlist
router.post(
  '/',
  validate(createPlaylistSchema, 'body'),
  catchAsync(playlistController.createPlaylist),
);

// Update playlist metadata or reorder tracklist
router.patch(
  '/:id',
  validate(playlistIdParamSchema, 'params'),
  validate(updatePlaylistSchema, 'body'),
  catchAsync(playlistController.updatePlaylist),
);

// Delete a playlist
router.delete(
  '/:id',
  validate(playlistIdParamSchema, 'params'),
  catchAsync(playlistController.deletePlaylist),
);

// Add tracks to the playlist (validates limit up to 100 tracks)
router.post(
  '/:id/tracks',
  validate(playlistIdParamSchema, 'params'),
  validate(addTracksSchema, 'body'),
  catchAsync(playlistController.addTracksToPlaylist),
);

// Remove a track from the playlist (re-sequences remaining track positions)
router.delete(
  '/:id/tracks/:trackId',
  validate(playlistAndTrackParamSchema, 'params'),
  catchAsync(playlistController.removeTrackFromPlaylist),
);

export default router;
