import { registry } from '../../config/openapi/openapiRegistry';
import { z } from 'zod';
import { searchQuerySchema } from './search.schema';

// Register input schemas
const SearchQuerySchema = registry.register('SearchQuery', searchQuerySchema);

// Define custom responses/models
const SearchResultsResponseSchema = registry.register(
  'SearchResultsResponse',
  z.object({
    artists: z.array(
      z.object({
        id: z.string().uuid(),
        artistName: z.string(),
        bio: z.string().nullable(),
        verified: z.boolean(),
        createdAt: z.coerce.date(),
      }),
    ),
    tracks: z.array(
      z.object({
        id: z.string().uuid(),
        artistId: z.string().uuid(),
        albumId: z.string().uuid().nullable(),
        title: z.string(),
        durationSeconds: z.number().int(),
        audioUrl: z.string().url(),
        state: z.string(),
        createdAt: z.coerce.date(),
        playCount: z.number().int(),
        likeCount: z.number().int(),
        artistName: z.string(),
        isLiked: z.boolean(),
      }),
    ),
    albums: z.array(
      z.object({
        id: z.string().uuid(),
        artistId: z.string().uuid(),
        title: z.string(),
        coverArtUrl: z.string().url().nullable(),
        releaseDate: z.coerce.date().nullable(),
        status: z.enum(['DRAFT', 'PUBLISHED']),
        createdAt: z.coerce.date(),
        artistName: z.string(),
      }),
    ),
    playlists: z.array(
      z.object({
        id: z.string().uuid(),
        userId: z.string(),
        name: z.string(),
        thumbnailUrl: z.string().url().nullable(),
        isPublic: z.boolean(),
        createdAt: z.coerce.date(),
        creatorName: z.string(),
      }),
    ),
  }),
);

// -------------------------------------------------------------
// SEARCH MODULE PATHS
// -------------------------------------------------------------

// 1. GET /api/v1/search
registry.registerPath({
  method: 'get',
  path: '/api/v1/search',
  summary: 'Global catalog search',
  description:
    'Search across artists, published albums, ready tracks, and public playlists using ILIKE or trigram similarity match. Rates are limited differently depending on user tier.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    query: SearchQuerySchema,
  },
  responses: {
    200: {
      description: 'Search results returned successfully',
      content: {
        'application/json': {
          schema: SearchResultsResponseSchema,
        },
      },
    },
    400: { description: 'Validation error: q parameter is empty or too long' },
    429: { description: 'Too many requests' },
  },
});
