import { registry } from '../../config/openapi/openapiRegistry';
import { z } from 'zod';
import {
  syncUserSchema,
  updateUserSchema,
  createApiKeySchema,
} from './user.schema';

// Register Schemas
const SyncUserSchema = registry.register('SyncUser', syncUserSchema);
const UpdateUserSchema = registry.register('UpdateUser', updateUserSchema);
const CreateApiKeySchema = registry.register(
  'CreateApiKey',
  createApiKeySchema,
);

// Define custom Zod responses
const ApiKeyResponseSchema = registry.register(
  'ApiKeyResponse',
  z.object({
    id: z.string().uuid(),
    name: z.string(),
    rawKey: z.string().optional(),
    createdAt: z.coerce.date(),
  }),
);

const UserProfileResponseSchema = registry.register(
  'UserProfileResponse',
  z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string(),
    isBlocked: z.boolean(),
    stripeCustomerId: z.string().nullable(),
    deletedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    managedProfiles: z.array(z.any()),
    playlists: z.array(z.any()),
  }),
);

// -------------------------------------------------------------
// USER MODULE PATHS
// -------------------------------------------------------------

// 1. POST /api/v1/user/sync/internal
registry.registerPath({
  method: 'post',
  path: '/api/v1/user/sync/internal',
  summary: 'Sync user metadata from Auth0',
  description: 'Called internally by Auth0 Post-Registration hooks.',
  security: [],
  request: {
    headers: z.object({
      'x-sync-secret': z
        .string()
        .openapi({ description: 'Auth0 webhook internal secret' }),
    }),
    body: {
      content: {
        'application/json': {
          schema: SyncUserSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User synced successfully',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            email: z.string(),
            displayName: z.string(),
          }),
        },
      },
    },
    401: { description: 'Missing or invalid sync secret' },
    400: { description: 'Invalid validation schema' },
  },
});

// 2. GET /api/v1/user
registry.registerPath({
  method: 'get',
  path: '/api/v1/user',
  summary: 'Get currently logged-in user profile details',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  responses: {
    200: {
      description: 'User profile retrieved successfully',
      content: {
        'application/json': {
          schema: UserProfileResponseSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// 3. PATCH /api/v1/user
registry.registerPath({
  method: 'patch',
  path: '/api/v1/user',
  summary: 'Update user profile details',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: UpdateUserSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User updated successfully',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            email: z.string(),
            displayName: z.string(),
          }),
        },
      },
    },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
  },
});

// 4. DELETE /api/v1/user
registry.registerPath({
  method: 'delete',
  path: '/api/v1/user',
  summary: 'Initiate user account deletion (soft delete)',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  responses: {
    204: { description: 'Account soft deleted and clean up job scheduled' },
    401: { description: 'Unauthorized' },
  },
});

// 5. POST /api/v1/user/keys
registry.registerPath({
  method: 'post',
  path: '/api/v1/user/keys',
  summary: 'Create a new custom API key',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateApiKeySchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'API key created successfully',
      content: {
        'application/json': {
          schema: ApiKeyResponseSchema,
        },
      },
    },
    400: { description: 'Validation error' },
    401: { description: 'Unauthorized' },
  },
});

// 6. GET /api/v1/user/keys
registry.registerPath({
  method: 'get',
  path: '/api/v1/user/keys',
  summary: 'List user API keys',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  responses: {
    200: {
      description: 'List of API keys retrieved',
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              id: z.string().uuid(),
              name: z.string(),
              createdAt: z.coerce.date(),
            }),
          ),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

// 7. DELETE /api/v1/user/keys/:id
registry.registerPath({
  method: 'delete',
  path: '/api/v1/user/keys/{id}',
  summary: 'Delete/revoke an API key',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    params: z.object({
      id: z.string().uuid().openapi({ description: 'API Key UUID ID' }),
    }),
  },
  responses: {
    204: { description: 'API key deleted successfully' },
    400: { description: 'Invalid UUID format' },
    401: { description: 'Unauthorized' },
    404: { description: 'API key not found' },
  },
});
