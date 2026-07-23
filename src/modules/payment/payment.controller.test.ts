import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import * as paymentService from './payment.service';
import { stripe } from '../../lib/stripe';

vi.mock('./payment.service', () => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  createSetupCheckoutSession: vi.fn(),
  processWebhookEvent: vi.fn(),
}));

vi.mock('../../lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

describe('PaymentController Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/payment/checkout', () => {
    it('should fail validation (400) if subscription tier is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/payment/checkout')
        .send({ tier: 'INVALID_TIER' });

      expect(response.status).toBe(400);
    });

    it('should create checkout session successfully (200)', async () => {
      vi.mocked(paymentService.createCheckoutSession).mockResolvedValueOnce(
        'https://checkout.url',
      );

      const response = await request(app)
        .post('/api/v1/payment/checkout')
        .send({ tier: 'PRO' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ url: 'https://checkout.url' });
      expect(paymentService.createCheckoutSession).toHaveBeenCalledWith(
        'test-user-id',
        'PRO',
      );
    });
  });

  describe('POST /api/v1/payment/portal', () => {
    it('should create customer portal session successfully (200)', async () => {
      vi.mocked(paymentService.createPortalSession).mockResolvedValueOnce(
        'https://portal.url',
      );

      const response = await request(app).post('/api/v1/payment/portal');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ url: 'https://portal.url' });
      expect(paymentService.createPortalSession).toHaveBeenCalledWith(
        'test-user-id',
      );
    });
  });

  describe('POST /api/v1/payment/setup-checkout', () => {
    it('should create setup checkout session successfully (200)', async () => {
      vi.mocked(
        paymentService.createSetupCheckoutSession,
      ).mockResolvedValueOnce('https://setup.checkout.url');

      const response = await request(app).post(
        '/api/v1/payment/setup-checkout',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ url: 'https://setup.checkout.url' });
      expect(paymentService.createSetupCheckoutSession).toHaveBeenCalledWith(
        'test-user-id',
      );
    });
  });

  describe('POST /api/v1/payment/webhook', () => {
    it('should throw BadRequestError if signature header is missing', async () => {
      const response = await request(app)
        .post('/api/v1/payment/webhook')
        .send({ id: 'evt_123' });

      expect(response.status).toBe(400);
    });

    it('should process verified webhook events successfully (200)', async () => {
      const mockEvent = {
        id: 'evt_123',
        type: 'customer.subscription.created',
      };
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValueOnce(
        mockEvent as any,
      );
      vi.mocked(paymentService.processWebhookEvent).mockResolvedValueOnce();

      const response = await request(app)
        .post('/api/v1/payment/webhook')
        .set('stripe-signature', 't=123,v1=abc')
        .send({ id: 'evt_123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
        expect.any(Buffer),
        't=123,v1=abc',
        'whsec_test',
      );
      expect(paymentService.processWebhookEvent).toHaveBeenCalledWith(
        mockEvent,
      );
    });
  });
});
