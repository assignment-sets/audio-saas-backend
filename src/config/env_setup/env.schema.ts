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
});

export type EnvConfig = z.infer<typeof envSchema>;
