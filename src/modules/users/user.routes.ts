import './user.openapi';
import { Router } from 'express';
import { internalSyncAuth } from '../../middleware/auth/internalAuth.middleware';
import { requireAuth } from '../../middleware/auth/requireAuth.middleware';
import { validate } from '../../middleware/validation/validate.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import * as userController from './user.controller';
import {
  syncUserSchema,
  updateUserSchema,
  createApiKeySchema,
  deleteApiKeySchema,
} from './user.schema';
import { createRateLimiter } from '../../middleware/rateLimit/rateLimiter.middleware';

const keyGenRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyPrefix: 'keygen',
});

const router = Router();

/**
 * 1. Public / Internal Service Routes
 * These bypass JWT/Hydration because they use Service-to-Service auth.
 */
router.post(
  '/sync/internal',
  internalSyncAuth,
  validate(syncUserSchema),
  catchAsync(userController.syncUser),
);

/**
 * 2. Security & Data Hydration Layer
 * Every route defined AFTER this line requires a valid JWT or API key
 * and an active (non-blocked) user in our database.
 */
router.use(requireAuth);

/**
 * 3. Protected User Routes
 * The controller now has access to 'req.user' automatically.
 */
router.get('/', catchAsync(userController.getCurrentUser));

router.patch(
  '/',
  validate(updateUserSchema),
  catchAsync(userController.updateUser),
);

router.delete('/', catchAsync(userController.deleteUser));

/**
 * 4. API Key Management
 */
router.post(
  '/keys',
  catchAsync(keyGenRateLimiter),
  validate(createApiKeySchema),
  catchAsync(userController.createApiKey),
);

router.get('/keys', catchAsync(userController.listApiKeys));

router.delete(
  '/keys/:id',
  validate(deleteApiKeySchema, 'params'),
  catchAsync(userController.deleteApiKey),
);

export default router;
