import type { Request, Response, NextFunction } from 'express';
import { rateLimitRedis } from '../../lib/rateLimitRedis.client';
import { TooManyRequestsError } from '../../lib/errors';

interface RateLimiterOptions {
  windowMs: number;
  max: number | ((req: Request) => number);
  keyPrefix: string;
}

export const createRateLimiter = (options: RateLimiterOptions) => {
  const { windowMs, max, keyPrefix } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.user?.id || req.ip;
    const key = `ratelimit:${keyPrefix}:${identifier}`;
    const now = Date.now();
    const clearBefore = now - windowMs;
    const member = `${now}-${Math.random()}`;

    const limit = typeof max === 'function' ? max(req) : max;

    try {
      const results = await rateLimitRedis
        .multi()
        .zremrangebyscore(key, 0, clearBefore)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, windowMs + 1000)
        .exec();

      if (!results || !results[2]) {
        return next(new TooManyRequestsError());
      }

      // results[2][1] is the count of requests inside the sliding window (the ZCARD command result)
      const currentCount = results[2][1] as number;

      const resetTime = Math.ceil((now + windowMs) / 1000);
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentCount));
      res.setHeader('X-RateLimit-Reset', resetTime);

      if (currentCount > limit) {
        // Clean up the element we just added to keep the logs clean
        await rateLimitRedis.zrem(key, member);
        return next(new TooManyRequestsError());
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
