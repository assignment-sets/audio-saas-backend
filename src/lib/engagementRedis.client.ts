import Redis from 'ioredis';
import { env } from '../config/env_setup/env';

export const engagementRedis = new Redis({
  host: env.ENGAGEMENT_REDIS_HOST,
  port: env.ENGAGEMENT_REDIS_PORT,
});
