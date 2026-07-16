import './payment.openapi';
import { Router } from 'express';
import * as paymentController from './payment.controller';
import { requireAuth } from '../../middleware/auth/requireAuth.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';
import { createRateLimiter } from '../../middleware/rateLimit/rateLimiter.middleware';

const router = Router();

const paymentRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyPrefix: 'payment',
});

// Public Webhook: Stripe needs to POST to this without JWT authentication
router.post('/webhook', catchAsync(paymentController.handleWebhook));

// Protected Routes: Requires user session
router.use(requireAuth);

router.post(
  '/checkout',
  catchAsync(paymentRateLimiter),
  catchAsync(paymentController.createCheckoutSession),
);
router.post(
  '/portal',
  catchAsync(paymentRateLimiter),
  catchAsync(paymentController.createPortalSession),
);

export default router;
