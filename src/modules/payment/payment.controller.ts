import type { Request, Response } from 'express';
import * as paymentService from './payment.service';
import { BadRequestError } from '../../lib/errors';
import { env } from '../../config/env_setup/env';
import { stripe } from '../../lib/stripe';
import { logger } from '../../config/logging_setup/logger';
import { UserTier } from '../users/user.service';

export const createCheckoutSession = async (req: Request, res: Response) => {
  const user = req.user!;
  const { tier } = req.body;

  if (tier !== UserTier.LITE && tier !== UserTier.PRO) {
    throw new BadRequestError(
      'Invalid subscription tier. Must be LITE or PRO.',
    );
  }

  const sessionUrl = await paymentService.createCheckoutSession(user.id, tier);
  return res.json({ url: sessionUrl });
};

export const createPortalSession = async (req: Request, res: Response) => {
  const user = req.user!;
  const sessionUrl = await paymentService.createPortalSession(user.id);
  return res.json({ url: sessionUrl });
};

export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    throw new BadRequestError('Missing stripe-signature header');
  }
  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    // req.body is a Buffer here because of express.raw middleware
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    logger.error(
      { err: err.message },
      'Stripe webhook signature verification failed',
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  await paymentService.processWebhookEvent(event);

  return res.status(200).json({ received: true });
};
