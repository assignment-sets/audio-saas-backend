import './search.openapi';
import { Router } from 'express';
import * as searchController from './search.controller';
import { searchQuerySchema } from './search.schema';
import { validate } from '../../middleware/validation/validate.middleware';
import { optionalAuth } from '../../middleware/auth/optionalAuth.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import { createRateLimiter } from '../../middleware/rateLimit/rateLimiter.middleware';
import { UserTier } from '../users/user.service';

const router = Router();

const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => {
    const tier = req.user?.tier;
    if (tier === UserTier.PRO) return 1000;
    if (tier === UserTier.LITE) return 200;
    return 60; // FREE / GUEST
  },
  keyPrefix: 'search',
});

router.get(
  '/',
  catchAsync(optionalAuth),
  catchAsync(searchRateLimiter),
  validate(searchQuerySchema, 'query'),
  catchAsync(searchController.search),
);

export default router;
