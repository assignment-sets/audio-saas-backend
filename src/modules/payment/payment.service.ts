import Stripe from 'stripe';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env_setup/env';
import { stripe } from '../../lib/stripe';
import { logger } from '../../config/logging_setup/logger';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { UserTier } from '../users/user.service';

export const createCheckoutSession = async (
  userId: string,
  tier: UserTier.LITE | UserTier.PRO,
): Promise<string> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  let stripeCustomerId = user.stripeCustomerId;

  // Create a Stripe customer if one doesn't exist yet
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.displayName,
      metadata: { userId: user.id },
    });
    stripeCustomerId = customer.id;

    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId },
    });
  }

  // Resolve the price ID based on the requested tier
  const priceId =
    tier === UserTier.PRO ? env.STRIPE_PRO_PRICE_ID : env.STRIPE_LITE_PRICE_ID;

  if (
    !priceId ||
    priceId === 'price_pro_placeholder' ||
    priceId === 'price_lite_placeholder'
  ) {
    throw new BadRequestError('Stripe price ID is not properly configured.');
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: env.STRIPE_SUCCESS_URL,
    cancel_url: env.STRIPE_CANCEL_URL,
  });

  if (!session.url) {
    throw new Error('Failed to generate Stripe checkout session URL');
  }

  return session.url;
};

export const createPortalSession = async (userId: string): Promise<string> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!user.stripeCustomerId) {
    throw new BadRequestError('No active billing history found for this user.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: env.STRIPE_SUCCESS_URL,
  });

  return session.url;
};

export const createSetupCheckoutSession = async (
  userId: string,
): Promise<string> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!env.STRIPE_API_PRICE_ID) {
    throw new BadRequestError(
      'Stripe API price ID is not properly configured.',
    );
  }

  let stripeCustomerId = user.stripeCustomerId;

  // 1. Ensure Stripe Customer exists
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.displayName,
      metadata: { userId: user.id },
    });
    stripeCustomerId = customer.id;

    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId },
    });
  }

  // 2. Create a Checkout Session in SETUP mode ($0 Vaulting)
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'setup',
    success_url: env.STRIPE_SUCCESS_URL,
    cancel_url: env.STRIPE_CANCEL_URL,
  });

  if (!session.url) {
    throw new Error('Failed to generate Stripe setup session URL');
  }

  return session.url;
};

export const processWebhookEvent = async (
  event: Stripe.Event,
): Promise<void> => {
  logger.info({ eventType: event.type }, 'Processing Stripe webhook event');

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as any;
      const stripeSubscriptionId = subscription.id;
      const stripeCustomerId = subscription.customer as string;
      const stripePriceId = subscription.items.data[0]?.price.id;
      const status = subscription.status;
      const currentPeriodStartRaw =
        subscription.current_period_start ??
        subscription.items?.data?.[0]?.current_period_start;
      const currentPeriodEndRaw =
        subscription.current_period_end ??
        subscription.items?.data?.[0]?.current_period_end;

      const currentPeriodStart = currentPeriodStartRaw
        ? new Date(currentPeriodStartRaw * 1000)
        : new Date();
      const currentPeriodEnd = currentPeriodEndRaw
        ? new Date(currentPeriodEndRaw * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (!stripePriceId) {
        logger.warn(
          { stripeSubscriptionId },
          'Subscription has no price items',
        );
        break;
      }

      const user = await prisma.user.findUnique({
        where: { stripeCustomerId },
      });

      if (!user) {
        logger.error(
          { stripeCustomerId },
          'User not found for Stripe Customer ID',
        );
        break;
      }

      await prisma.subscription.upsert({
        where: { stripeSubscriptionId },
        update: {
          stripePriceId,
          status,
          currentPeriodStart,
          currentPeriodEnd,
        },
        create: {
          userId: user.id,
          stripeSubscriptionId,
          stripePriceId,
          status,
          currentPeriodStart,
          currentPeriodEnd,
        },
      });

      logger.info(
        { userId: user.id, stripeSubscriptionId, status, stripePriceId },
        'Successfully upserted user subscription record',
      );
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as any;
      const stripeSubscriptionId = subscription.id;

      await prisma.subscription
        .update({
          where: { stripeSubscriptionId },
          data: { status: 'canceled' },
        })
        .then(() => {
          logger.info(
            { stripeSubscriptionId },
            'Marked subscription as canceled in database',
          );
        })
        .catch((err) => {
          logger.warn(
            { err: err.message, stripeSubscriptionId },
            'Failed to mark subscription as canceled (it may not exist in database yet)',
          );
        });
      break;
    }

    case 'invoice.payment_succeeded':
    case 'invoice.paid': {
      const invoice = event.data.object as any;
      const amount = invoice.amount_paid;
      const currency = invoice.currency;
      const stripeCustomerId = invoice.customer as string;

      // Skip logging if it is a $0 invoice (free trial or credit proration)
      if (amount === 0) {
        logger.info(
          { invoiceId: invoice.id },
          'Skipping $0 invoice payment logging.',
        );
        break;
      }

      // Fallback: If payment_intent is missing, use invoice.id
      const stripePaymentIntentId =
        (invoice.payment_intent as string) || invoice.id;

      const user = await prisma.user.findUnique({
        where: { stripeCustomerId },
      });

      if (!user) {
        logger.error(
          { stripeCustomerId },
          'User not found for Stripe Customer ID during payment success logging',
        );
        break;
      }

      await prisma.payment.upsert({
        where: { stripePaymentIntentId },
        update: {
          status: 'succeeded',
        },
        create: {
          userId: user.id,
          stripePaymentIntentId,
          amount,
          currency,
          status: 'succeeded',
        },
      });

      logger.info(
        { stripePaymentIntentId, userId: user.id },
        'Logged successful payment record',
      );
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as any;
      const stripePaymentIntentId =
        (invoice.payment_intent as string) || invoice.id;
      const stripeCustomerId = invoice.customer as string;
      const amount = invoice.amount_due;
      const currency = invoice.currency;

      const user = await prisma.user.findUnique({
        where: { stripeCustomerId },
      });

      if (!user) {
        logger.error(
          { stripeCustomerId },
          'User not found for Stripe Customer ID during payment failure logging',
        );
        break;
      }

      await prisma.payment.upsert({
        where: { stripePaymentIntentId },
        update: {
          status: 'failed',
        },
        create: {
          userId: user.id,
          stripePaymentIntentId,
          amount,
          currency,
          status: 'failed',
        },
      });

      logger.info(
        { stripePaymentIntentId, userId: user.id },
        'Logged failed payment record',
      );
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only process if this was a setup session (our pay-as-you-go setup)
      if (session.mode === 'setup') {
        const stripeCustomerId = session.customer as string;

        const user = await prisma.user.findUnique({
          where: { stripeCustomerId },
        });

        if (!user) {
          logger.error(
            { stripeCustomerId },
            'User not found for setup session completion',
          );
          break;
        }

        if (!env.STRIPE_API_PRICE_ID) {
          logger.error(
            'STRIPE_API_PRICE_ID is not configured during setup session completion',
          );
          break;
        }

        // Retrieve the setup intent to extract the vaulted payment method
        const setupIntentId = session.setup_intent as string;
        const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
        const paymentMethodId = setupIntent.payment_method as string;

        // Set this payment method as the customer's default for future invoices
        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });

        // Automatically open their metered subscription ledger ($0 upfront)
        // Creating this subscription emits customer.subscription.created,
        // which automatically upserts into our Subscription database table.
        const subscription = await stripe.subscriptions.create({
          customer: stripeCustomerId,
          items: [{ price: env.STRIPE_API_PRICE_ID }],
        });

        logger.info(
          { userId: user.id, subscriptionId: subscription.id },
          'Successfully vaulted card and opened metered subscription via Setup Checkout',
        );
      }
      break;
    }

    default: {
      logger.info(
        { eventType: event.type },
        'Unhandled Stripe webhook event type',
      );
      break;
    }
  }
};
