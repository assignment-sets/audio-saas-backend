import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  meteredUsage,
  hasActiveMeteredSubscription,
} from './meteredBilling.middleware';
import { stripe } from '../../lib/stripe';
import { env } from '../../config/env_setup/env';
import { UserTier } from '../../modules/users/user.service';
import { PaymentRequiredError } from '../../lib/errors';

vi.mock('../../lib/stripe', () => ({
  stripe: {
    billing: {
      meterEvents: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  },
}));

describe('Metered Billing Middleware Unit Tests', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {};
    mockRes = {};
    mockNext = vi.fn();
  });

  describe('hasActiveMeteredSubscription', () => {
    it('should return false if env.STRIPE_API_PRICE_ID is missing', () => {
      const originalPriceId = env.STRIPE_API_PRICE_ID;
      (env as any).STRIPE_API_PRICE_ID = undefined;

      try {
        const result = hasActiveMeteredSubscription([
          {
            stripePriceId: 'price_api_123',
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 100000),
          } as any,
        ]);
        expect(result).toBe(false);
      } finally {
        (env as any).STRIPE_API_PRICE_ID = originalPriceId;
      }
    });

    it('should return true if active subscription matches STRIPE_API_PRICE_ID and currentPeriodEnd is in future', () => {
      const originalPriceId = env.STRIPE_API_PRICE_ID;
      (env as any).STRIPE_API_PRICE_ID = 'price_api_123';

      try {
        const result = hasActiveMeteredSubscription([
          {
            stripePriceId: 'price_api_123',
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 100000),
          } as any,
        ]);
        expect(result).toBe(true);
      } finally {
        (env as any).STRIPE_API_PRICE_ID = originalPriceId;
      }
    });

    it('should return false if subscription status is canceled or expired', () => {
      const originalPriceId = env.STRIPE_API_PRICE_ID;
      (env as any).STRIPE_API_PRICE_ID = 'price_api_123';

      try {
        const result = hasActiveMeteredSubscription([
          {
            stripePriceId: 'price_api_123',
            status: 'canceled',
            currentPeriodEnd: new Date(Date.now() + 100000),
          } as any,
        ]);
        expect(result).toBe(false);
      } finally {
        (env as any).STRIPE_API_PRICE_ID = originalPriceId;
      }
    });
  });

  describe('meteredUsage middleware', () => {
    it('should call next() if req.user is unauthenticated or guest', () => {
      mockReq.user = undefined;

      meteredUsage(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
    });

    it('should call next() without charging if req.user.tier is LITE or PRO', () => {
      mockReq.user = {
        id: 'user_lite',
        tier: UserTier.LITE,
        subscriptions: [],
      } as any;

      meteredUsage(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
    });

    it('should throw PaymentRequiredError (402) if FREE tier user lacks metered subscription', () => {
      mockReq.user = {
        id: 'user_free',
        tier: UserTier.FREE,
        subscriptions: [],
      } as any;

      meteredUsage(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(PaymentRequiredError));
      expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
    });

    it('should call next() and trigger stripe.billing.meterEvents.create for FREE tier user with active metered sub', async () => {
      const originalPriceId = env.STRIPE_API_PRICE_ID;
      const originalEventName = env.STRIPE_METER_EVENT_NAME;

      (env as any).STRIPE_API_PRICE_ID = 'price_api_123';
      (env as any).STRIPE_METER_EVENT_NAME = 'api_call';

      mockReq.user = {
        id: 'user_free_with_card',
        stripeCustomerId: 'cus_123',
        tier: UserTier.FREE,
        subscriptions: [
          {
            stripePriceId: 'price_api_123',
            status: 'active',
            currentPeriodEnd: new Date(Date.now() + 100000),
          },
        ],
      } as any;

      try {
        meteredUsage(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
        expect(stripe.billing.meterEvents.create).toHaveBeenCalledWith({
          event_name: 'api_call',
          payload: {
            stripe_customer_id: 'cus_123',
            value: '1',
          },
          identifier: expect.stringMatching(/^evt_user_free_with_card_/),
        });
      } finally {
        (env as any).STRIPE_API_PRICE_ID = originalPriceId;
        (env as any).STRIPE_METER_EVENT_NAME = originalEventName;
      }
    });
  });
});
