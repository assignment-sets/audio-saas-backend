import { registry } from '../../config/openapi/openapiRegistry';
import { z } from 'zod';
import { createAlbumSchema, updateAlbumSchema } from './album.schema';

// Register input schemas
const CreateAlbumSchema = registry.register('CreateAlbum', createAlbumSchema);
const UpdateAlbumSchema = registry.register('UpdateAlbum', updateAlbumSchema);

// Define custom responses/models
const AlbumTrackSchema = registry.register(
  'AlbumTrack',
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

const AlbumSchema = registry.register(
  'Album',
  z.object({
    id: z.string().uuid(),
    artistId: z.string().uuid(),
    title: z.string(),
    coverArtUrl: z.string().url().nullable(),
    releaseDate: z.coerce.date().nullable(),
    status: z.enum(['DRAFT', 'PUBLISHED']),
    createdAt: z.coerce.date(),
    deletedAt: z.coerce.date().nullable(),
  }),
);

const AlbumDetailsResponseSchema = registry.register(
  'AlbumDetailsResponse',
  z.object({
    id: z.string().uuid(),
    artistId: z.string().uuid(),
    title: z.string(),
    coverArtUrl: z.string().url().nullable(),
    releaseDate: z.coerce.date().nullable(),
    status: z.enum(['DRAFT', 'PUBLISHED']),
    createdAt: z.coerce.date(),
    deletedAt: z.coerce.date().nullable(),
    tracks: z.array(AlbumTrackSchema),
  }),
);

const AlbumListResponseSchema = registry.register(
  'AlbumListResponse',
  z.object({
    albums: z.array(
      z.object({
        id: z.string().uuid(),
        artistId: z.string().uuid(),
        title: z.string(),
        coverArtUrl: z.string().url().nullable(),
        releaseDate: z.coerce.date().nullable(),
        status: z.enum(['DRAFT', 'PUBLISHED']),
        createdAt: z.coerce.date(),
        deletedAt: z.coerce.date().nullable(),
        tracks: z.array(AlbumTrackSchema).optional(),
      }),
    ),
    nextCursor: z.string().uuid().nullable(),
    hasMore: z.boolean(),
  }),
);

// -------------------------------------------------------------
// ALBUM MODULE PATHS
// -------------------------------------------------------------

// 1. GET /api/v1/album/artist/:artistId
registry.registerPath({
  method: 'get',
  path: '/api/v1/album/artist/{artistId}',
  summary: 'Get all albums for an artist',
  description:
    'Retrieve albums for a specific artist. Public view returns only PUBLISHED albums. Authenticated managers of the artist profile receive both DRAFT and PUBLISHED albums including tracklists.',
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
        .openapi({ description: 'Album UUID cursor for pagination' }),
      limit: z
        .string()
        .optional()
        .openapi({ description: 'Number of albums to retrieve (default: 10)' }),
    }),
  },
  responses: {
    200: {
      description: 'Albums retrieved successfully',
      content: {
        'application/json': {
          schema: AlbumListResponseSchema,
        },
      },
    },
    404: { description: 'Artist profile not found' },
    400: { description: 'Validation error' },
  },
});

// 2. GET /api/v1/album/:id
registry.registerPath({
  method: 'get',
  path: '/api/v1/album/{id}',
  summary: 'Get single album details',
  description:
    'Retrieve a single album by ID. Accessible publicly if PUBLISHED; requires manager permissions if DRAFT.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Album UUID ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Album details retrieved successfully',
      content: {
        'application/json': {
          schema: AlbumDetailsResponseSchema,
        },
      },
    },
    400: { description: 'Invalid UUID format' },
    403: { description: 'Access to draft album is restricted' },
    404: { description: 'Album not found' },
  },
});

// 3. POST /api/v1/album
registry.registerPath({
  method: 'post',
  path: '/api/v1/album',
  summary: 'Create a new album',
  description:
    'Create a new album in DRAFT status. Requires manager permissions on the target artist profile.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateAlbumSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Album created successfully',
      content: {
        'application/json': {
          schema: AlbumSchema,
        },
      },
    },
    400: {
      description: 'Validation error / Failed to register authorization tuples',
    },
    401: { description: 'Unauthorized' },
    403: {
      description: 'Not authorized to create albums for this artist profile',
    },
  },
});

// 4. PATCH /api/v1/album/:id
registry.registerPath({
  method: 'patch',
  path: '/api/v1/album/{id}',
  summary: 'Update album metadata and/or manage tracklist',
  description:
    'Update metadata of an album. If the album is a draft, tracks can be added, removed, or reordered.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Album UUID ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateAlbumSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Album updated successfully',
      content: {
        'application/json': {
          schema: AlbumSchema,
        },
      },
    },
    400: {
      description:
        'Validation error / Cannot modify tracklist of a published album',
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Not authorized to edit this album' },
    404: { description: 'Album not found' },
  },
});

// 5. POST /api/v1/album/:id/publish
registry.registerPath({
  method: 'post',
  path: '/api/v1/album/{id}/publish',
  summary: 'Publish the album',
  description: 'Publish a draft album, making it publicly visible.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Album UUID ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Album published successfully',
      content: {
        'application/json': {
          schema: AlbumSchema,
        },
      },
    },
    400: { description: 'Validation error / Publish guardrail failure' },
    401: { description: 'Unauthorized' },
    403: { description: 'Not authorized to publish this album' },
    404: { description: 'Album not found' },
  },
});

// 6. DELETE /api/v1/album/:id
registry.registerPath({
  method: 'delete',
  path: '/api/v1/album/{id}',
  summary: 'Delete the album',
  description: 'Delete an album. Requires delete permissions.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Album UUID ID' }),
    }),
  },
  responses: {
    204: {
      description: 'Album deleted successfully',
    },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
    403: { description: 'Not authorized to delete this album' },
    404: { description: 'Album not found' },
  },
});
