import { registry } from '../../config/openapi/openapiRegistry';
import { z } from 'zod';
import {
  createPlaylistSchema,
  updatePlaylistSchema,
  addTracksSchema,
} from './playlist.schema';

// Register input schemas
const CreatePlaylistSchema = registry.register(
  'CreatePlaylist',
  createPlaylistSchema,
);
const UpdatePlaylistSchema = registry.register(
  'UpdatePlaylist',
  updatePlaylistSchema,
);
const AddTracksSchema = registry.register('AddTracks', addTracksSchema);

// Define custom responses/models
const PlaylistSchema = registry.register(
  'Playlist',
  z.object({
    id: z.string().uuid(),
    userId: z.string(),
    name: z.string(),
    thumbnailUrl: z.string().url().nullable(),
    isPublic: z.boolean(),
    createdAt: z.coerce.date(),
  }),
);

const PlaylistTrackDetailSchema = registry.register(
  'PlaylistTrackDetail',
  z.object({
    id: z.string().uuid(),
    artistId: z.string().uuid(),
    albumId: z.string().uuid().nullable(),
    trackNumber: z.number().int().nullable(),
    title: z.string(),
    durationSeconds: z.number().int(),
    audioUrl: z.string().url(),
    state: z.string(),
    createdAt: z.coerce.date(),
    publishedAt: z.coerce.date().nullable(),
    playCount: z.number().int(),
    likeCount: z.number().int(),
    position: z.number().int(),
    addedAt: z.coerce.date(),
    isLiked: z.boolean(),
  }),
);

const PlaylistDetailsResponseSchema = registry.register(
  'PlaylistDetailsResponse',
  z.object({
    id: z.string().uuid(),
    userId: z.string(),
    name: z.string(),
    thumbnailUrl: z.string().url().nullable(),
    isPublic: z.boolean(),
    createdAt: z.coerce.date(),
    tracks: z.array(PlaylistTrackDetailSchema),
  }),
);

const PlaylistListResponseSchema = registry.register(
  'PlaylistListResponse',
  z.object({
    data: z.array(PlaylistSchema),
    nextCursor: z.string().uuid().nullable(),
    hasMore: z.boolean(),
  }),
);

// -------------------------------------------------------------
// PLAYLIST MODULE PATHS
// -------------------------------------------------------------

// 1. GET /api/v1/playlist/:id
registry.registerPath({
  method: 'get',
  path: '/api/v1/playlist/{id}',
  summary: 'Get playlist by ID',
  description:
    'Retrieve details and ready tracks of a playlist by ID. Access is restricted if the playlist is private and the user lacks view permissions.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Playlist UUID ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Playlist details retrieved successfully',
      content: {
        'application/json': {
          schema: PlaylistDetailsResponseSchema,
        },
      },
    },
    400: { description: 'Invalid UUID format' },
    403: { description: 'Access to private playlist is restricted' },
    404: { description: 'Playlist not found' },
  },
});

// 2. GET /api/v1/playlist
registry.registerPath({
  method: 'get',
  path: '/api/v1/playlist',
  summary: 'Search playlists by name',
  description:
    'Search public playlists by name (case-insensitive). Also returns user private playlists if authenticated.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    query: z.object({
      search: z
        .string()
        .optional()
        .openapi({ description: 'Search term for playlist name' }),
      cursor: z
        .string()
        .uuid()
        .optional()
        .openapi({ description: 'Pagination cursor (Playlist ID)' }),
      limit: z
        .string()
        .optional()
        .openapi({
          description: 'Number of playlists to retrieve (default: 10)',
        }),
    }),
  },
  responses: {
    200: {
      description: 'Search results retrieved successfully',
      content: {
        'application/json': {
          schema: PlaylistListResponseSchema,
        },
      },
    },
    400: { description: 'Validation error' },
  },
});

// 3. GET /api/v1/playlist/user/:userId
registry.registerPath({
  method: 'get',
  path: '/api/v1/playlist/user/{userId}',
  summary: 'Get playlists of a specific user',
  description:
    'Retrieve public playlists of a specific user. If the requester matches the target user, private playlists are also returned.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      userId: z.string().openapi({ description: 'Target User ID' }),
    }),
    query: z.object({
      cursor: z
        .string()
        .uuid()
        .optional()
        .openapi({ description: 'Pagination cursor (Playlist ID)' }),
      limit: z
        .string()
        .optional()
        .openapi({
          description: 'Number of playlists to retrieve (default: 10)',
        }),
    }),
  },
  responses: {
    200: {
      description: 'User playlists retrieved successfully',
      content: {
        'application/json': {
          schema: PlaylistListResponseSchema,
        },
      },
    },
    400: { description: 'Validation error' },
  },
});

// 4. POST /api/v1/playlist
registry.registerPath({
  method: 'post',
  path: '/api/v1/playlist',
  summary: 'Create a new playlist',
  description:
    'Create a new playlist. Enforces subscription limits on privacy (private playlists) and maximum playlist count.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreatePlaylistSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Playlist created successfully',
      content: {
        'application/json': {
          schema: PlaylistSchema,
        },
      },
    },
    400: {
      description: 'Validation error / Failed to register authorization tuples',
    },
    401: { description: 'Unauthorized' },
    402: { description: 'Payment Required - limits reached' },
  },
});

// 5. PATCH /api/v1/playlist/:id
registry.registerPath({
  method: 'patch',
  path: '/api/v1/playlist/{id}',
  summary: 'Update playlist metadata or reorder tracklist',
  description:
    'Update playlist attributes (name, privacy, thumbnail) or reorder the full tracklist sequence.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Playlist UUID ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdatePlaylistSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Playlist updated successfully',
      content: {
        'application/json': {
          schema: PlaylistSchema,
        },
      },
    },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
    402: { description: 'Payment Required - privacy limits exceeded' },
    403: { description: 'Forbidden - Not authorized to edit this playlist' },
    404: { description: 'Playlist not found' },
  },
});

// 6. DELETE /api/v1/playlist/:id
registry.registerPath({
  method: 'delete',
  path: '/api/v1/playlist/{id}',
  summary: 'Delete a playlist',
  description: 'Delete a playlist by ID. Requires owner permissions.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Playlist UUID ID' }),
    }),
  },
  responses: {
    204: { description: 'Playlist deleted successfully' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Not authorized to delete this playlist' },
    404: { description: 'Playlist not found' },
  },
});

// 7. POST /api/v1/playlist/:id/tracks
registry.registerPath({
  method: 'post',
  path: '/api/v1/playlist/{id}/tracks',
  summary: 'Add tracks to the playlist',
  description:
    'Append tracks to a playlist. Enforces capacity limit according to user subscription tier.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Playlist UUID ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: AddTracksSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Tracks added successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description: 'Validation error / Track not found / Track not ready',
    },
    401: { description: 'Unauthorized' },
    402: { description: 'Payment Required - playlist capacity exceeded' },
    404: { description: 'Playlist not found' },
  },
});

// 8. DELETE /api/v1/playlist/:id/tracks/:trackId
registry.registerPath({
  method: 'delete',
  path: '/api/v1/playlist/{id}/tracks/{trackId}',
  summary: 'Remove a track from the playlist',
  description:
    'Remove a specific track from a playlist, automatically shifting subsequent track positions to close the gap.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Playlist UUID ID' }),
      trackId: z.string().uuid().openapi({ description: 'Track UUID ID' }),
    }),
  },
  responses: {
    204: { description: 'Track removed successfully' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Not authorized to modify this playlist' },
    404: { description: 'Playlist not found / Track not found in playlist' },
  },
});
