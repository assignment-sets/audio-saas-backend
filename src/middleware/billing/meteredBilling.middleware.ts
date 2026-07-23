import type { Request, Response, NextFunction } from 'express';
import type { Subscription } from '@prisma/client';
import crypto from 'crypto';
import { stripe } from '../../lib/stripe';
import { logger } from '../../config/logging_setup/logger';
import { env } from '../../config/env_setup/env';
import { PaymentRequiredError } from '../../lib/errors';
import { UserTier, getUserTier } from '../../modules/users/user.service';

/**
 * Checks if a user's subscriptions array contains an active metered subscription matching STRIPE_API_PRICE_ID.
 */
export const hasActiveMeteredSubscription = (
  subscriptions: Subscription[],
): boolean => {
  if (!env.STRIPE_API_PRICE_ID) return false;
  return subscriptions.some(
    (sub) =>
      sub.stripePriceId === env.STRIPE_API_PRICE_ID &&
      (sub.status === 'active' || sub.status === 'trialing') &&
      new Date(sub.currentPeriodEnd) > new Date(),
  );
};

/**
 * Middleware that enforces metered billing checks for FREE tier users on pay-as-you-go routes.
 * - LITE and PRO users bypass metering completely.
 * - FREE users without a vaulted card receive a 402 Payment Required error.
 * - FREE users with a vaulted card proceed immediately and asynchronously increment Stripe meter events.
 */
export const meteredUsage = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const user = req.user;

  // 1. Unauthenticated or guest — no billing applies
  if (!user) {
    return next();
  }

  const subscriptions = user.subscriptions || [];
  const tier = user.tier || getUserTier(subscriptions);

  // 2. Paid tiers (LITE / PRO) are on fixed plans — bypass metering
  if (tier === UserTier.LITE || tier === UserTier.PRO) {
    return next();
  }

  // 3. FREE tier — verify active metered subscription (vaulted card)
  if (!hasActiveMeteredSubscription(subscriptions)) {
    return next(
      new PaymentRequiredError(
        'API access requires a valid payment method on file. Please complete setup checkout to save your card.',
      ),
    );
  }

  const eventName = env.STRIPE_METER_EVENT_NAME || 'audio_saas_api_meter';

  // Hook into Express's finish event, which fires when the response has been completely sent
  res.on('finish', () => {
    // Avoid charging if server response isnt success
    if (res.statusCode >= 200 && res.statusCode < 300) {
      stripe.billing.meterEvents
        .create({
          event_name: eventName,
          payload: {
            stripe_customer_id: user.stripeCustomerId!,
            value: '1',
          },
          identifier: `evt_${user.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        })
        .catch((err) => {
          logger.error(
            { err, userId: user.id },
            'Failed to send Stripe meter event',
          );
        });
    }
  });

  return next();
};
