import { registry } from '../../config/openapi/openapiRegistry';
import { z } from 'zod';
import {
  createArtistSchema,
  updateArtistSchema,
  appointManagerSchema,
} from './artist.schema';

// Register input schemas
const CreateArtistSchema = registry.register(
  'CreateArtist',
  createArtistSchema,
);
const UpdateArtistSchema = registry.register(
  'UpdateArtist',
  updateArtistSchema,
);
const AppointManagerSchema = registry.register(
  'AppointManager',
  appointManagerSchema,
);

// Define custom responses/models
const ArtistProfileSchema = registry.register(
  'ArtistProfile',
  z.object({
    id: z.string().uuid(),
    userId: z.string(),
    artistName: z.string(),
    bio: z.string().nullable(),
    verified: z.boolean(),
    createdAt: z.coerce.date(),
  }),
);

const ArtistProfileWithCountSchema = registry.register(
  'ArtistProfileWithCount',
  z.object({
    id: z.string().uuid(),
    userId: z.string(),
    artistName: z.string(),
    bio: z.string().nullable(),
    verified: z.boolean(),
    createdAt: z.coerce.date(),
    _count: z.object({
      followers: z.number().int(),
      tracks: z.number().int(),
    }),
  }),
);

const ArtistProfileDetailsResponseSchema = registry.register(
  'ArtistProfileDetailsResponse',
  z.object({
    id: z.string().uuid(),
    userId: z.string(),
    artistName: z.string(),
    bio: z.string().nullable(),
    verified: z.boolean(),
    createdAt: z.coerce.date(),
    user: z
      .object({
        isBlocked: z.boolean(),
      })
      .nullable(),
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
      }),
    ),
    tracks: z.array(
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
    ),
    _count: z.object({
      followers: z.number().int(),
      tracks: z.number().int(),
      albums: z.number().int(),
    }),
  }),
);

const ArtistFollowerListResponseSchema = registry.register(
  'ArtistFollowerListResponse',
  z.object({
    followers: z.array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        followedAt: z.coerce.date(),
      }),
    ),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
);

// -------------------------------------------------------------
// ARTIST MODULE PATHS
// -------------------------------------------------------------

// 1. GET /api/v1/artist/:id/followers
registry.registerPath({
  method: 'get',
  path: '/api/v1/artist/{id}/followers',
  summary: 'Get followers of an artist',
  description: 'Retrieve a paginated list of followers for an artist.',
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
    }),
    query: z.object({
      limit: z
        .string()
        .optional()
        .openapi({
          description: 'Number of followers to retrieve (default: 20)',
        }),
      cursor: z
        .string()
        .optional()
        .openapi({ description: 'Pagination cursor (User ID)' }),
    }),
  },
  responses: {
    200: {
      description: 'List of followers retrieved successfully',
      content: {
        'application/json': {
          schema: ArtistFollowerListResponseSchema,
        },
      },
    },
    404: { description: 'Artist profile not found' },
    400: { description: 'Validation error' },
  },
});

// 2. GET /api/v1/artist/:artistName
registry.registerPath({
  method: 'get',
  path: '/api/v1/artist/{artistName}',
  summary: 'Get artist profile by name',
  description:
    'Retrieve public details of an artist profile by name. Includes top published albums and ready tracks.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      artistName: z.string().openapi({ description: 'Unique artist name' }),
    }),
  },
  responses: {
    200: {
      description: 'Artist profile retrieved successfully',
      content: {
        'application/json': {
          schema: ArtistProfileDetailsResponseSchema,
        },
      },
    },
    404: { description: 'Artist not found' },
  },
});

// 3. GET /api/v1/artist/id/:id
registry.registerPath({
  method: 'get',
  path: '/api/v1/artist/id/{id}',
  summary: 'Get artist profile by ID',
  description:
    'Private/Admin/Manager endpoint to view artist profile details by UUID.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Artist profile retrieved successfully',
      content: {
        'application/json': {
          schema: ArtistProfileWithCountSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Inadequate permissions to access this profile' },
    404: { description: 'Artist profile not found' },
  },
});

// 4. POST /api/v1/artist
registry.registerPath({
  method: 'post',
  path: '/api/v1/artist',
  summary: "Create current user's artist profile",
  description:
    'Register a new artist profile for the logged-in user. Each user can own at most one artist profile.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateArtistSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Artist profile created successfully',
      content: {
        'application/json': {
          schema: ArtistProfileSchema,
        },
      },
    },
    400: {
      description:
        'Validation error / Profile already exists / Artist name taken',
    },
    401: { description: 'Unauthorized' },
  },
});

// 5. PATCH /api/v1/artist/:id
registry.registerPath({
  method: 'patch',
  path: '/api/v1/artist/{id}',
  summary: 'Update artist profile',
  description: 'Update the metadata of an artist profile.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateArtistSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Artist profile updated successfully',
      content: {
        'application/json': {
          schema: ArtistProfileSchema,
        },
      },
    },
    400: { description: 'Validation error / Artist name already taken' },
    401: { description: 'Unauthorized' },
    403: {
      description:
        'Forbidden - You do not have permission to update this profile',
    },
    404: { description: 'Artist profile not found' },
  },
});

// 6. POST /api/v1/artist/:id/follow
registry.registerPath({
  method: 'post',
  path: '/api/v1/artist/{id}/follow',
  summary: 'Follow an artist',
  description: 'Add the artist to the user following list.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
    }),
  },
  responses: {
    201: { description: 'Followed successfully' },
    401: { description: 'Unauthorized' },
    404: { description: 'Artist profile not found' },
  },
});

// 7. DELETE /api/v1/artist/:id/follow
registry.registerPath({
  method: 'delete',
  path: '/api/v1/artist/{id}/follow',
  summary: 'Unfollow an artist',
  description: 'Remove the artist from the user following list.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
    }),
  },
  responses: {
    204: { description: 'Unfollowed successfully' },
    401: { description: 'Unauthorized' },
    404: { description: 'Artist profile not found' },
  },
});

// 8. GET /api/v1/artist/:id/following
registry.registerPath({
  method: 'get',
  path: '/api/v1/artist/{id}/following',
  summary: 'Check following status',
  description:
    'Check if the logged-in user is currently following the specified artist.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Following status retrieved',
      content: {
        'application/json': {
          schema: z.object({
            isFollowing: z.boolean(),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    404: { description: 'Artist profile not found' },
  },
});

// 9. POST /api/v1/artist/:id/managers
registry.registerPath({
  method: 'post',
  path: '/api/v1/artist/{id}/managers',
  summary: 'Appoint a manager',
  description: 'Appoint a user as a manager of the artist profile by email.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: AppointManagerSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Manager appointed successfully',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description:
        'Validation error / Cannot appoint deactivated user / Owner / Already manager',
    },
    401: { description: 'Unauthorized' },
    402: { description: 'Payment Required - tier manager limit exceeded' },
    403: {
      description: 'Forbidden - Only the artist owner can appoint managers',
    },
    404: {
      description: 'Artist profile not found / User with this email not found',
    },
  },
});

// 10. DELETE /api/v1/artist/:id/managers/:managerId
registry.registerPath({
  method: 'delete',
  path: '/api/v1/artist/{id}/managers/{managerId}',
  summary: 'Revoke a manager',
  description: 'Revoke manager delegation for a user.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
      managerId: z.string().openapi({ description: 'Manager User ID' }),
    }),
  },
  responses: {
    204: { description: 'Manager revoked successfully' },
    401: { description: 'Unauthorized' },
    403: {
      description: 'Forbidden - Only the artist owner can revoke managers',
    },
    404: {
      description: 'Artist profile not found / Manager relationship not found',
    },
  },
});

// 11. GET /api/v1/artist/:id/managers
registry.registerPath({
  method: 'get',
  path: '/api/v1/artist/{id}/managers',
  summary: 'List managers for an artist',
  description:
    'Retrieve all managers appointed for an artist profile. Requires owner or manager permissions.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'Artist UUID ID' }),
    }),
  },
  responses: {
    200: {
      description: 'List of managers retrieved successfully',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.string(),
              email: z.string(),
              displayName: z.string(),
            }),
          ),
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden - Not authorized to view managers list' },
  },
});
