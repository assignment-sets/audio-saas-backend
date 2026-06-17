import { Redis } from 'ioredis';

const redisHost = process.env.ENGAGEMENT_REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.ENGAGEMENT_REDIS_PORT || '6380', 10);

export const redis = new Redis({
  host: redisHost,
  port: redisPort,
});

redis.on('error', (err: any) => {
  // Gracefully log instead of throwing/crashing with unhandled error events
  console.error('Redis connection error:', err.message);
});
