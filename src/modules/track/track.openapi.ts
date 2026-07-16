import { registry } from '../../config/openapi/openapiRegistry';
import { z } from 'zod';
import {
  createTrackSchema,
  updateTrackSchema,
  trackPlaySchema,
  generateUploadUrlSchema,
  transcodeWebhookSchema,
  batchPlaysWebhookSchema,
} from './track.schema';

// Register input schemas
const CreateTrackSchema = registry.register('CreateTrack', createTrackSchema);
const UpdateTrackSchema = registry.register('UpdateTrack', updateTrackSchema);
const TrackPlaySchema = registry.register('TrackPlay', trackPlaySchema);
const GenerateUploadUrlSchema = registry.register(
  'GenerateUploadUrl',
  generateUploadUrlSchema,
);
const TranscodeWebhookSchema = registry.register(
  'TranscodeWebhook',
  transcodeWebhookSchema,
);
const BatchPlaysWebhookSchema = registry.register(
  'BatchPlaysWebhook',
  batchPlaysWebhookSchema,
);

// Define custom responses/models
const TrackSchema = registry.register(
  'Track',
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
  }),
);

const TrackWithEngagementSchema = registry.register(
  'TrackWithEngagement',
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
    isLiked: z.boolean(),
  }),
);

const TrackWithRelationsSchema = registry.register(
  'TrackWithRelations',
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
    isLiked: z.boolean(),
    artist: z.object({
      id: z.string().uuid(),
      artistName: z.string(),
    }),
    album: z
      .object({
        id: z.string().uuid(),
        title: z.string(),
      })
      .nullable(),
  }),
);

const TrackListResponseSchema = registry.register(
  'TrackListResponse',
  z.object({
    tracks: z.array(TrackWithEngagementSchema),
    nextCursor: z.string().uuid().nullable(),
    hasMore: z.boolean(),
  }),
);

// -------------------------------------------------------------
// TRACK MODULE PATHS
// -------------------------------------------------------------

// 1. GET /api/v1/track/artist/:artistId
registry.registerPath({
  method: 'get',
  path: '/api/v1/track/artist/{artistId}',
  summary: 'Get ready tracks for an artist',
  description:
    'Retrieve all tracks in ready state for a specific artist. Supports cursor-based pagination.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      artistId: z
        .string()
        .uuid()
        .openapi({ description: 'Artist Profile UUID ID' }),
    }),
    query: z.object({
      cursor: z
        .string()
        .uuid()
        .optional()
        .openapi({ description: 'Track UUID cursor for pagination' }),
      limit: z
        .string()
        .optional()
        .openapi({ description: 'Number of tracks to retrieve (default: 10)' }),
    }),
  },
  responses: {
    200: {
      description: 'Tracks retrieved successfully',
      content: {
        'application/json': {
          schema: TrackListResponseSchema,
        },
      },
    },
    400: { description: 'Validation error' },
  },
});

// 2. POST /api/v1/track/webhook/transcode
registry.registerPath({
  method: 'post',
  path: '/api/v1/track/webhook/transcode',
  summary: 'Webhook: Handle audio transcoding status update',
  description:
    'Called by the audio processing worker to notify the API of a track transcode success or failure.',
  request: {
    headers: z.object({
      'x-webhook-secret': z
        .string()
        .openapi({ description: 'Webhook secret key' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: TranscodeWebhookSchema,
        },
      },
    },
  },
  responses: {
    200: { description: 'Webhook processed successfully' },
    401: { description: 'Unauthorized webhook' },
    400: { description: 'Validation error' },
  },
});

// 3. POST /api/v1/track/webhook/batch-plays
registry.registerPath({
  method: 'post',
  path: '/api/v1/track/webhook/batch-plays',
  summary: 'Webhook: Handle batch track play updates',
  description:
    'Ingest analytics/play statistics in batches from external analytics workers.',
  request: {
    headers: z.object({
      'x-webhook-secret': z
        .string()
        .openapi({ description: 'Webhook secret key' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: BatchPlaysWebhookSchema,
        },
      },
    },
  },
  responses: {
    200: { description: 'Webhook processed successfully' },
    401: { description: 'Unauthorized webhook' },
    400: { description: 'Validation error' },
  },
});

// 4. POST /api/v1/track/:id/play
registry.registerPath({
  method: 'post',
  path: '/api/v1/track/{id}/play',
  summary: 'Record a track play',
  description:
    'Submit listening activity for a track. Public visitor or authenticated member.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Track UUID ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: TrackPlaySchema,
        },
      },
    },
  },
  responses: {
    202: { description: 'Listening activity recorded/queued' },
    400: { description: 'Validation error' },
    429: { description: 'Too many requests' },
  },
});

// 5. GET /api/v1/track/artist/:artistId/dashboard
registry.registerPath({
  method: 'get',
  path: '/api/v1/track/artist/{artistId}/dashboard',
  summary: "Get artist's dashboard tracks",
  description:
    'Retrieve all tracks (ready, processing, failed) belonging to an artist profile. Requires artist manager/owner permissions.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      artistId: z
        .string()
        .uuid()
        .openapi({ description: 'Artist Profile UUID ID' }),
    }),
    query: z.object({
      cursor: z
        .string()
        .uuid()
        .optional()
        .openapi({ description: 'Track UUID cursor for pagination' }),
      limit: z
        .string()
        .optional()
        .openapi({ description: 'Number of tracks to retrieve (default: 10)' }),
    }),
  },
  responses: {
    200: {
      description: 'Dashboard tracks retrieved successfully',
      content: {
        'application/json': {
          schema: TrackListResponseSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Not authorized to view dashboard' },
    400: { description: 'Validation error' },
  },
});

// 6. GET /api/v1/track/:id
registry.registerPath({
  method: 'get',
  path: '/api/v1/track/{id}',
  summary: 'Get single track details',
  description:
    'Retrieve full metadata and relational properties of a track. Only managers/owners of the track can view this detailed profile.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Track UUID ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Track details retrieved successfully',
      content: {
        'application/json': {
          schema: TrackWithRelationsSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: {
      description: 'Forbidden - Not authorized to view internal track details',
    },
    404: { description: 'Track not found' },
  },
});

// 7. POST /api/v1/track
registry.registerPath({
  method: 'post',
  path: '/api/v1/track',
  summary: 'Create a new track',
  description:
    'Register a new track in processing state. Triggers asynchronous HLS transcoding transcoding workers.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateTrackSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Track record created and transcoding job queued',
      content: {
        'application/json': {
          schema: TrackSchema,
        },
      },
    },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
    403: {
      description: 'Forbidden - Not authorized to add tracks for this artist',
    },
  },
});

// 8. PATCH /api/v1/track/:id
registry.registerPath({
  method: 'patch',
  path: '/api/v1/track/{id}',
  summary: 'Update track metadata',
  description:
    'Modify non-critical track metadata like title, trackNumber, or album association.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Track UUID ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateTrackSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Track metadata updated successfully',
      content: {
        'application/json': {
          schema: TrackSchema,
        },
      },
    },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Not authorized to update track details' },
    404: { description: 'Track not found' },
  },
});

// 9. DELETE /api/v1/track/:id
registry.registerPath({
  method: 'delete',
  path: '/api/v1/track/{id}',
  summary: 'Delete a track',
  description: 'Soft delete a track from the database.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Track UUID ID' }),
    }),
  },
  responses: {
    204: { description: 'Track deleted successfully' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Not authorized to delete track' },
    404: { description: 'Track not found' },
  },
});

// 10. POST /api/v1/track/:id/like
registry.registerPath({
  method: 'post',
  path: '/api/v1/track/{id}/like',
  summary: 'Like a track',
  description: 'Add a track to the user liked tracks list.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Track UUID ID' }),
    }),
  },
  responses: {
    201: { description: 'Liked successfully' },
    401: { description: 'Unauthorized' },
    404: { description: 'Track not found' },
  },
});

// 11. DELETE /api/v1/track/:id/like
registry.registerPath({
  method: 'delete',
  path: '/api/v1/track/{id}/like',
  summary: 'Unlike a track',
  description: 'Remove a track from the user liked tracks list.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Track UUID ID' }),
    }),
  },
  responses: {
    204: { description: 'Unliked successfully' },
    401: { description: 'Unauthorized' },
    404: { description: 'Track not found' },
  },
});

// 12. POST /api/v1/track/upload-url
registry.registerPath({
  method: 'post',
  path: '/api/v1/track/upload-url',
  summary: 'Generate audio upload URL',
  description: 'Generate an AWS S3 presigned URL to upload raw audio files.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: GenerateUploadUrlSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Presigned upload URL generated successfully',
      content: {
        'application/json': {
          schema: z.object({
            url: z
              .string()
              .url()
              .openapi({ description: 'S3 presigned upload URL' }),
            key: z
              .string()
              .openapi({
                description: 'Generated storage destination file key',
              }),
          }),
        },
      },
    },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
    403: {
      description: 'Forbidden - Not authorized to upload audio for this artist',
    },
    429: { description: 'Too many requests' },
  },
});
