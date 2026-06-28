import Stripe from 'stripe';
import { env } from '../config/env_setup/env';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-09-30.acacia' as any,
});
