import { registry } from '../../config/openapi/openapiRegistry';
import { z } from 'zod';

// Define custom responses/models
const CheckoutResponseSchema = registry.register(
  'CheckoutResponse',
  z.object({
    url: z
      .string()
      .url()
      .openapi({ description: 'Stripe Checkout Session URL' }),
  }),
);

const PortalResponseSchema = registry.register(
  'PortalResponse',
  z.object({
    url: z
      .string()
      .url()
      .openapi({ description: 'Stripe Customer Portal Session URL' }),
  }),
);

// -------------------------------------------------------------
// PAYMENT MODULE PATHS
// -------------------------------------------------------------

// 1. POST /api/v1/payment/checkout
registry.registerPath({
  method: 'post',
  path: '/api/v1/payment/checkout',
  summary: 'Create checkout session',
  description:
    'Generate a Stripe Checkout Session URL for subscription purchase. Note: Redirects users to Stripe hosted checkout page.',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            tier: z
              .enum(['LITE', 'PRO'])
              .openapi({ description: 'Subscription tier to purchase' }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Checkout session created successfully',
      content: {
        'application/json': {
          schema: CheckoutResponseSchema,
        },
      },
    },
    400: { description: 'Invalid subscription tier' },
    401: { description: 'Unauthorized' },
  },
});

// 2. POST /api/v1/payment/portal
registry.registerPath({
  method: 'post',
  path: '/api/v1/payment/portal',
  summary: 'Create billing portal session',
  description:
    'Generate a Stripe Customer Portal Session URL for subscription management (upgrades, cancellations, invoices).',
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  responses: {
    200: {
      description: 'Billing portal session created successfully',
      content: {
        'application/json': {
          schema: PortalResponseSchema,
        },
      },
    },
    400: { description: 'No active billing history found for this user' },
    401: { description: 'Unauthorized' },
  },
});

// 3. POST /api/v1/payment/webhook
registry.registerPath({
  method: 'post',
  path: '/api/v1/payment/webhook',
  summary: 'Stripe Webhook Listener',
  description:
    'Incoming webhook listener to process real-time updates from Stripe (e.g. subscription lifecycle changes).',
  request: {
    headers: z.object({
      'stripe-signature': z.string().openapi({
        description: 'Header for verifying the authenticity of Stripe events',
      }),
    }),
  },
  responses: {
    200: {
      description: 'Stripe webhook event processed',
      content: {
        'application/json': {
          schema: z.object({
            received: z.boolean().openapi({ example: true }),
          }),
        },
      },
    },
    400: { description: 'Missing signature / verification failed' },
    500: { description: 'Stripe webhook secret not configured' },
  },
});
