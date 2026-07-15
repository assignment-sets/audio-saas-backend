// src/config/env_setup/env.schema.ts ~annotator~
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['production', 'test', 'development']),
  PORT: z.coerce.number().int().positive(),

  // DB postgres
  DATABASE_URL: z.url(),

  // FGA
  FGA_API_URL: z.url(),
  FGA_STORE_ID: z.string(),
  FGA_MODEL_ID: z.string(),
  FGA_TOKEN_ISSUER: z.string(),
  FGA_API_AUD: z.string(),
  FGA_CLIENT_ID: z.string(),
  FGA_CLIENT_SECRET: z.string(),

  // Auth0
  AUTH0_AUDIENCE: z.string(),
  AUTH0_DOMAIN: z.string(),
  AUTH0_CLIENT_ID: z.string(),
  AUTH0_SECRET: z.string(),
  AUTH0_TOKEN_SIGNING_ALGO: z.string(),
  AUTH0_INTERNAL_SYNC_SECRET: z.string(),

  // Redis
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number().int().positive(),
  ENGAGEMENT_REDIS_HOST: z.string(),
  ENGAGEMENT_REDIS_PORT: z.coerce.number().int().positive(),
  RATE_LIMIT_REDIS_HOST: z.string(),
  RATE_LIMIT_REDIS_PORT: z.coerce.number().int().positive(),
  CACHE_REDIS_HOST: z.string(),
  CACHE_REDIS_PORT: z.coerce.number().int().positive(),

  // AWS / S3
  AWS_REGION: z.string(),
  S3_BUCKET_NAME: z.string(),

  // Webhook secrets
  AUD_WEBHOOK_SECRET: z.string(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_LITE_PRICE_ID: z.string().default('price_lite_placeholder'),
  STRIPE_PRO_PRICE_ID: z.string().default('price_pro_placeholder'),
  STRIPE_PORTAL_CONFIG_ID: z.string(),
  STRIPE_SUCCESS_URL: z.string().url().default('http://localhost:5173/'),
  STRIPE_CANCEL_URL: z.string().url().default('http://localhost:5173/'),
});

export type EnvConfig = z.infer<typeof envSchema>;
