import { Router } from 'express';
import * as paymentController from './payment.controller';
import { requireAuth } from '../../middleware/auth/requireAuth.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';

const router = Router();

// Public Webhook: Stripe needs to POST to this without JWT authentication
router.post('/webhook', catchAsync(paymentController.handleWebhook));

// Protected Routes: Requires user session
router.use(requireAuth);

router.post('/checkout', catchAsync(paymentController.createCheckoutSession));
router.post('/portal', catchAsync(paymentController.createPortalSession));

export default router;
