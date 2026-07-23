import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as paymentService from './payment.service';
import { prisma } from '../../lib/prisma';
import { stripe } from '../../lib/stripe';
import { UserTier } from '../users/user.service';
import { env } from '../../config/env_setup/env';
import { NotFoundError, BadRequestError } from '../../lib/errors';

vi.mock('../../lib/stripe', () => ({
  stripe: {
    customers: {
      create: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

describe('PaymentService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('should throw NotFoundError if user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      await expect(
        paymentService.createCheckoutSession('user_1', UserTier.PRO),
      ).rejects.toThrow(NotFoundError);
    });

    it('should create customer on stripe if stripeCustomerId is missing', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        displayName: 'Test User',
        stripeCustomerId: null,
      } as any;

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser);
      vi.mocked(stripe.customers.create).mockResolvedValueOnce({
        id: 'cus_new',
      } as any);
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValueOnce({
        url: 'https://checkout.url',
      } as any);

      const url = await paymentService.createCheckoutSession(
        'user_1',
        UserTier.PRO,
      );

      expect(stripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        metadata: { userId: 'user_1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { stripeCustomerId: 'cus_new' },
      });
      expect(url).toBe('https://checkout.url');
    });

    it('should throw BadRequestError if price ID is not properly configured', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        displayName: 'Test User',
        stripeCustomerId: 'cus_123',
      } as any;

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser);

      const originalPriceId = env.STRIPE_PRO_PRICE_ID;
      env.STRIPE_PRO_PRICE_ID = 'price_pro_placeholder';

      try {
        await expect(
          paymentService.createCheckoutSession('user_1', UserTier.PRO),
        ).rejects.toThrow(BadRequestError);
      } finally {
        env.STRIPE_PRO_PRICE_ID = originalPriceId;
      }
    });
  });

  describe('createPortalSession', () => {
    it('should throw NotFoundError if user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      await expect(
        paymentService.createPortalSession('user_1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if user lacks stripeCustomerId', async () => {
      const mockUser = { id: 'user_1', stripeCustomerId: null } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser);

      await expect(
        paymentService.createPortalSession('user_1'),
      ).rejects.toThrow(BadRequestError);
    });

    it('should call billingPortal session create and return url', async () => {
      const mockUser = { id: 'user_1', stripeCustomerId: 'cus_123' } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser);
      vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValueOnce({
        url: 'https://billing.portal.url',
      } as any);

      const url = await paymentService.createPortalSession('user_1');

      expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_123',
        return_url: 'https://test.audiosass.com/success', // Success URL mocked in setup
      });
      expect(url).toBe('https://billing.portal.url');
    });
  });

  describe('createSetupCheckoutSession', () => {
    it('should throw NotFoundError if user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      await expect(
        paymentService.createSetupCheckoutSession('user_1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if STRIPE_API_PRICE_ID is not configured', async () => {
      const mockUser = { id: 'user_1', stripeCustomerId: 'cus_123' } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser);

      const originalPriceId = env.STRIPE_API_PRICE_ID;
      (env as any).STRIPE_API_PRICE_ID = undefined;

      try {
        await expect(
          paymentService.createSetupCheckoutSession('user_1'),
        ).rejects.toThrow(BadRequestError);
      } finally {
        (env as any).STRIPE_API_PRICE_ID = originalPriceId;
      }
    });

    it('should create customer on stripe if missing and return setup session url', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        displayName: 'Test User',
        stripeCustomerId: null,
      } as any;

      const originalPriceId = env.STRIPE_API_PRICE_ID;
      (env as any).STRIPE_API_PRICE_ID = 'price_api_metered';

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser);
      vi.mocked(stripe.customers.create).mockResolvedValueOnce({
        id: 'cus_setup',
      } as any);
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValueOnce({
        url: 'https://setup.checkout.url',
      } as any);

      try {
        const url = await paymentService.createSetupCheckoutSession('user_1');

        expect(stripe.customers.create).toHaveBeenCalledWith({
          email: 'test@example.com',
          name: 'Test User',
          metadata: { userId: 'user_1' },
        });
        expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
          customer: 'cus_setup',
          mode: 'setup',
          success_url: expect.any(String),
          cancel_url: expect.any(String),
        });
        expect(url).toBe('https://setup.checkout.url');
      } finally {
        (env as any).STRIPE_API_PRICE_ID = originalPriceId;
      }
    });
  });

  describe('processWebhookEvent', () => {
    it('should upsert subscription on customer.subscription.created', async () => {
      const mockEvent = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            items: {
              data: [{ price: { id: 'price_pro' } }],
            },
            current_period_start: 1718000000,
            current_period_end: 1720000000,
          },
        },
      } as any;

      const mockUser = { id: 'user_1', stripeCustomerId: 'cus_123' } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser);

      await paymentService.processWebhookEvent(mockEvent);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_123' },
      });
      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { stripeSubscriptionId: 'sub_123' },
          create: expect.objectContaining({
            userId: 'user_1',
            stripeSubscriptionId: 'sub_123',
            stripePriceId: 'price_pro',
            status: 'active',
          }),
        }),
      );
    });

    it('should cancel subscription on customer.subscription.deleted', async () => {
      const mockEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_123',
          },
        },
      } as any;

      vi.mocked(prisma.subscription.update).mockResolvedValueOnce({} as any);

      await paymentService.processWebhookEvent(mockEvent);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_123' },
        data: { status: 'canceled' },
      });
    });

    it('should upsert payment on invoice.payment_succeeded', async () => {
      const mockEvent = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'inv_123',
            amount_paid: 1500,
            currency: 'usd',
            customer: 'cus_123',
            payment_intent: 'pi_123',
          },
        },
      } as any;

      const mockUser = { id: 'user_1', stripeCustomerId: 'cus_123' } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser);
      vi.mocked(prisma.payment.upsert).mockResolvedValueOnce({} as any);

      await paymentService.processWebhookEvent(mockEvent);

      expect(prisma.payment.upsert).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: 'pi_123' },
        update: { status: 'succeeded' },
        create: {
          userId: 'user_1',
          stripePaymentIntentId: 'pi_123',
          amount: 1500,
          currency: 'usd',
          status: 'succeeded',
        },
      });
    });
  });
});
