import Redis from 'ioredis';
import { env } from '../config/env_setup/env';

export const rateLimitRedis = new Redis({
  host: env.RATE_LIMIT_REDIS_HOST,
  port: env.RATE_LIMIT_REDIS_PORT,
});
