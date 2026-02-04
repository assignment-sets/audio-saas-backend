import { envSchema } from "../schemas/env.schema";
import "dotenv/config";

export const env = envSchema.parse(process.env);
