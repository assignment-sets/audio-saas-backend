import { vi } from 'vitest';

// ==========================================
// 1. DYNAMIC ENVIRONMENT OVERRIDES
// ==========================================
vi.mock('../config/env_setup/env', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../config/env_setup/env')>();
  return {
    env: {
      ...actual.env,
      AUTH0_AUDIENCE: 'https://test.audiosass.com',
      AUTH0_DOMAIN: 'dev-eu86qy2rzdy3nf6d.us.auth0.com',
      AUTH0_TOKEN_SIGNING_ALGO: 'RS256',
      AWS_REGION: 'us-east-1',
      S3_BUCKET_NAME: 'test-bucket',
      AUTH0_INTERNAL_SYNC_SECRET: 'test-sync-secret',
      STRIPE_PRO_PRICE_ID: 'price_pro',
      STRIPE_LITE_PRICE_ID: 'price_lite',
      AUD_WEBHOOK_SECRET: 'test-webhook-secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_SUCCESS_URL: 'https://test.audiosass.com/success',
      STRIPE_CANCEL_URL: 'https://test.audiosass.com/cancel',
    },
  };
});

// ==========================================
// 2. LOGGING ISOLATION
// ==========================================
vi.mock('../config/logging_setup/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ==========================================
// 2.1 AUTH0 CLIENT MOCK
// ==========================================
vi.mock('../lib/auth0.client', () => ({
  management: {
    users: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// ==========================================
// 3. UNIVERSAL PRISMA CLIENT MOCK
// ==========================================
// Creates a shared proxy that intercepts all database calls dynamically.
// This allows any model (album, user, track, etc.) to use standard mock methods automatically.
const createMockModelOperations = () => ({
  create: vi.fn(),
  createMany: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
});

const mockPrismaInstance = new Proxy({} as any, {
  get(target, prop) {
    if (prop === '$transaction') {
      return vi.fn((arg) => {
        if (typeof arg === 'function') {
          return arg(mockPrismaInstance);
        }
        return Promise.resolve(arg);
      });
    }
    if (
      prop === '$executeRawUnsafe' ||
      prop === '$executeRaw' ||
      prop === '$queryRaw' ||
      prop === '$queryRawUnsafe'
    ) {
      if (!target[prop]) {
        target[prop] = vi.fn();
      }
      return target[prop];
    }
    if (typeof prop === 'string' && !prop.startsWith('$')) {
      if (!target[prop]) {
        target[prop] = createMockModelOperations();
      }
      return target[prop];
    }
    return target[prop];
  },
});

vi.mock('../lib/prisma', () => ({
  prisma: mockPrismaInstance,
}));

// ==========================================
// 4. INFRASTRUCTURE & EXTERNAL CLIENTS
// ==========================================
vi.mock('../lib/fga.client', () => ({
  fgaClient: { check: vi.fn(), write: vi.fn() },
}));

vi.mock('../lib/cacheRedis.client', () => ({
  cacheRedis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock('../lib/engagementRedis.client', () => ({
  engagementRedis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), rpush: vi.fn() },
}));

vi.mock('../lib/rateLimitRedis.client', () => ({
  rateLimitRedis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock('../lib/queue.client', () => ({
  userQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-id' }) },
  trackQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-id' }) },
  artistQueue: { add: vi.fn().mockResolvedValue({ id: 'mock-id' }) },
  addUserJob: vi.fn(),
  addTrackJob: vi.fn(),
  addArtistJob: vi.fn(),
}));

// Mock S3 client and request presigner globally using class syntax to preserve constructors
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = vi.fn();
  },
  PutObjectCommand: class {},
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-s3-signed-url.com'),
}));

// ==========================================
// 5. GLOBAL MIDDLEWARE INTERCEPTORS
// ==========================================
vi.mock('../middleware/rateLimit/rateLimiter.middleware', () => ({
  createRateLimiter: () => async (req: any, res: any, next: any) => next(),
}));

// Decouples Auth0 validation using header injection ('x-test-unauthenticated')
vi.mock('../middleware/auth/requireAuth.middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (req.headers['x-test-unauthenticated'] === 'true') {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      displayName: 'Test User',
    };
    next();
  },
}));

vi.mock('../middleware/auth/optionalAuth.middleware', () => ({
  optionalAuth: async (req: any, res: any, next: any) => {
    if (req.headers['x-test-unauthenticated'] === 'true') {
      req.user = undefined;
    } else {
      req.user = {
        id: 'test-user-id',
        email: 'test@example.com',
        displayName: 'Test User',
      };
    }
    next();
  },
}));
