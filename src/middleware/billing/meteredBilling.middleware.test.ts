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
  let finishCallback: () => void;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      headers: {},
    };

    // Mock Express Response lifecycle event listener
    mockRes = {
      statusCode: 200,
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'finish') {
          finishCallback = cb;
        }
        return mockRes as Response;
      }),
    };

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
    it('should call next() if req.user is unauthenticated or guest', async () => {
      mockReq.user = undefined;

      await meteredUsage(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
    });

    it('should bypass metering if request is from Web UI (not using API Key)', async () => {
      mockReq.headers = { authorization: 'Bearer auth0_jwt_token_xyz' };
      mockReq.user = {
        id: 'user_free_web',
        tier: UserTier.FREE,
        subscriptions: [],
      } as any;

      await meteredUsage(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
    });

    it('should call next() without charging if user tier is LITE or PRO (even on API Key requests)', async () => {
      mockReq.headers = { 'x-api-key': 'ak_live_12345' };
      mockReq.user = {
        id: 'user_lite',
        tier: UserTier.LITE,
        subscriptions: [],
      } as any;

      await meteredUsage(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
    });

    it('should pass PaymentRequiredError (402) to next() if FREE tier API Key user lacks metered subscription', async () => {
      mockReq.headers = { 'x-api-key': 'ak_live_12345' };
      mockReq.user = {
        id: 'user_free',
        tier: UserTier.FREE,
        subscriptions: [],
      } as any;

      await meteredUsage(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(PaymentRequiredError));
      expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();
    });

    it('should call next() and send meter event on res finish for FREE tier user with valid API key and metered sub', async () => {
      const originalPriceId = env.STRIPE_API_PRICE_ID;
      const originalEventName = env.STRIPE_METER_EVENT_NAME;

      (env as any).STRIPE_API_PRICE_ID = 'price_api_123';
      (env as any).STRIPE_METER_EVENT_NAME = 'api_call';

      mockReq.headers = { authorization: 'Bearer ak_live_secret_key' };
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
        await meteredUsage(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalledWith();

        // Ensure event wasn't fired before response finished
        expect(stripe.billing.meterEvents.create).not.toHaveBeenCalled();

        // Trigger response finish event
        if (finishCallback) finishCallback();

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
