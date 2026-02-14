// src/config/env_setup/env.ts ~annotator~
import { envSchema } from "./env.schema";
import "dotenv/config";

export const env = envSchema.parse(process.env);
