import Redis from 'ioredis';
import { env } from '../config/env_setup/env';

export const cacheRedis = new Redis({
  host: env.CACHE_REDIS_HOST,
  port: env.CACHE_REDIS_PORT,
});
