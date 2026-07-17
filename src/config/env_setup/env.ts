// src/config/env_setup/env.ts ~annotator~
import path from 'path';
import dotenv from 'dotenv';
import { envSchema } from './env.schema';

// 1. Identify the current runtime mode injected by cross-env
const environment = process.env.NODE_ENV || 'development';
const isTest = environment === 'test';

// 2. Load the environment-specific file first (e.g., .env.test)
// If the file is missing, dotenv will ignore it safely without crashing.
dotenv.config({
  path: path.resolve(process.cwd(), `.env.${environment}`),
  quiet: isTest,
});

// 3. Load the default .env file to fill in any shared variables or missing gaps
dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: isTest });

// 4. Parse and freeze variables against your Zod schema.
// If anything critical is missing from both files, Zod will catch it right here.
export const env = envSchema.parse(process.env);
