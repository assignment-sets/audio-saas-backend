import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as userService from './user.service';
import { UserTier } from './user.service';
import { prisma } from '../../lib/prisma';
import { management } from '../../lib/auth0.client';
import { addUserJob } from '../../lib/queue.client';
import {
  NotFoundError,
  ForbiddenError,
  InternalServerError,
  BadRequestError,
} from '../../lib/errors';
import { JobName } from '../../queues/types';

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../../lib/auth0.client', () => ({
  management: {
    users: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../../lib/queue.client', () => ({
  addUserJob: vi.fn(),
}));

vi.mock('../../config/logging_setup/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../config/env_setup/env', () => ({
  env: {
    STRIPE_PRO_PRICE_ID: 'price_pro',
    STRIPE_LITE_PRICE_ID: 'price_lite',
  },
}));

describe('UserService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserTier', () => {
    it('should return FREE when subscriptions list is empty', () => {
      expect(userService.getUserTier([])).toBe(UserTier.FREE);
    });

    it('should return FREE if status is not active or trialing', () => {
      const expiredSub = {
        id: 'sub_1',
        status: 'incomplete',
        currentPeriodEnd: new Date(Date.now() + 100000).toISOString(),
        stripePriceId: 'price_pro',
      } as any;
      expect(userService.getUserTier([expiredSub])).toBe(UserTier.FREE);
    });

    it('should return FREE if currentPeriodEnd has already elapsed', () => {
      const expiredSub = {
        id: 'sub_1',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() - 1000).toISOString(),
        stripePriceId: 'price_pro',
      } as any;
      expect(userService.getUserTier([expiredSub])).toBe(UserTier.FREE);
    });

    it('should return PRO tier when subscription price id matches PRO price id', () => {
      const activeProSub = {
        id: 'sub_1',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
        stripePriceId: 'price_pro',
      } as any;
      expect(userService.getUserTier([activeProSub])).toBe(UserTier.PRO);
    });

    it('should return LITE tier when subscription price id matches LITE price id', () => {
      const activeLiteSub = {
        id: 'sub_1',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
        stripePriceId: 'price_lite',
      } as any;
      expect(userService.getUserTier([activeLiteSub])).toBe(UserTier.LITE);
    });
  });

  describe('syncUser', () => {
    it('should upsert user metadata successfully', async () => {
      const mockUser = {
        id: 'auth0|123',
        email: 'test@example.com',
        displayName: 'Test User',
      } as any;
      vi.mocked(prisma.user.upsert).mockResolvedValueOnce(mockUser);

      const result = await userService.syncUser({
        id: 'auth0|123',
        email: 'test@example.com',
        displayName: 'Test User',
      });

      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { id: 'auth0|123' },
        update: { email: 'test@example.com', displayName: 'Test User' },
        create: {
          id: 'auth0|123',
          email: 'test@example.com',
          displayName: 'Test User',
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should propagate database upsert errors', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(prisma.user.upsert).mockRejectedValueOnce(dbError);

      await expect(
        userService.syncUser({
          id: 'auth0|123',
          email: 'test@example.com',
          displayName: 'Test User',
        }),
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getUserById', () => {
    it('should retrieve active user by ID', async () => {
      const mockUser = {
        id: 'user_1',
        isBlocked: false,
        deletedAt: null,
      } as any;
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(mockUser);

      const result = await userService.getUserById({ id: 'user_1' });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'user_1',
          isBlocked: false,
          deletedAt: null,
        },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null if user is blocked or soft-deleted', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);

      const result = await userService.getUserById({ id: 'blocked_user' });

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should reject updates for social login accounts', async () => {
      await expect(
        userService.updateUser('google-oauth2|123', {
          displayName: 'New Name',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if user not found', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);

      await expect(
        userService.updateUser('auth0|123', { displayName: 'New Name' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should update Auth0 and Database successfully', async () => {
      const existingUser = {
        email: 'old@example.com',
        displayName: 'Old Name',
      } as any;
      const updatedUser = {
        id: 'auth0|123',
        email: 'new@example.com',
        displayName: 'New Name',
      } as any;

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(existingUser);
      vi.mocked(management.users.update).mockResolvedValueOnce({} as any);
      vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser);

      const result = await userService.updateUser('auth0|123', {
        displayName: 'New Name',
        email: 'new@example.com',
      });

      expect(management.users.update).toHaveBeenCalledWith('auth0|123', {
        name: 'New Name',
        email: 'new@example.com',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'auth0|123' },
        data: { displayName: 'New Name', email: 'new@example.com' },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should roll back Auth0 update if database update fails', async () => {
      const existingUser = {
        email: 'old@example.com',
        displayName: 'Old Name',
      } as any;

      vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(existingUser);
      vi.mocked(management.users.update).mockResolvedValueOnce({} as any);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(
        new Error('DB Failed'),
      );

      await expect(
        userService.updateUser('auth0|123', {
          displayName: 'New Name',
          email: 'new@example.com',
        }),
      ).rejects.toThrow(InternalServerError);

      // Verify Auth0 rollback was triggered with original details
      expect(management.users.update).toHaveBeenLastCalledWith('auth0|123', {
        name: 'Old Name',
        email: 'old@example.com',
      });
    });
  });

  describe('deleteUser', () => {
    it("should throw NotFoundError if user doesn't exist", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      await expect(userService.deleteUser('missing_id')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should exit early if user is already soft-deleted', async () => {
      const softDeletedUser = { id: 'user_1', deletedAt: new Date() } as any;
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(softDeletedUser);

      await userService.deleteUser('user_1');

      expect(management.users.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should block user in Auth0, soft-delete in DB, and queue hard cleanup', async () => {
      const activeUser = { id: 'auth0|123', deletedAt: null } as any;

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeUser);
      vi.mocked(management.users.update).mockResolvedValueOnce({} as any);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any);
      vi.mocked(addUserJob).mockResolvedValueOnce({} as any);

      await userService.deleteUser('auth0|123');

      expect(management.users.update).toHaveBeenCalledWith('auth0|123', {
        blocked: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'auth0|123' },
        data: expect.objectContaining({
          isBlocked: true,
          deletedAt: expect.any(Date),
        }),
      });
      expect(addUserJob).toHaveBeenCalledWith(JobName.USER_CLEANUP, {
        userId: 'auth0|123',
      });
    });

    it('should roll back Auth0 blocking if database soft-delete fails', async () => {
      const activeUser = { id: 'auth0|123', deletedAt: null } as any;

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeUser);
      vi.mocked(management.users.update).mockResolvedValueOnce({} as any);
      vi.mocked(prisma.user.update).mockRejectedValueOnce(
        new Error('DB Delete failed'),
      );

      await expect(userService.deleteUser('auth0|123')).rejects.toThrow(
        InternalServerError,
      );

      // Verify Auth0 rollback to active state (blocked: false)
      expect(management.users.update).toHaveBeenLastCalledWith('auth0|123', {
        blocked: false,
      });
    });
  });

  describe('API Key Management', () => {
    describe('createApiKey', () => {
      it('should generate, hash, and persist API key', async () => {
        const mockApiKey = {
          id: 'key_1',
          userId: 'user_1',
          name: 'prod_key',
          keyHash: 'some_hash',
          createdAt: new Date(),
        } as any;
        vi.mocked(prisma.apiKey.create).mockResolvedValueOnce(mockApiKey);

        const result = await userService.createApiKey('user_1', 'prod_key');

        expect(prisma.apiKey.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: 'user_1',
            name: 'prod_key',
            keyHash: expect.any(String),
          }),
        });
        expect(result.rawKey).toContain('ak_live_');
        expect(result.name).toBe('prod_key');
        expect(result.id).toBe('key_1');
      });
    });

    describe('listApiKeys', () => {
      it('should retrieve keys ordered by createdAt desc', async () => {
        const mockKeys = [
          { id: 'key_1', name: 'prod', createdAt: new Date() },
        ] as any;
        vi.mocked(prisma.apiKey.findMany).mockResolvedValueOnce(mockKeys);

        const result = await userService.listApiKeys('user_1');

        expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
          where: { userId: 'user_1' },
          select: { id: true, name: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        expect(result).toEqual(mockKeys);
      });
    });

    describe('deleteApiKey', () => {
      it('should throw NotFoundError if key is missing', async () => {
        vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce(null);

        await expect(
          userService.deleteApiKey('user_1', 'key_1'),
        ).rejects.toThrow(NotFoundError);
      });

      it('should throw ForbiddenError if request is from non-owner', async () => {
        const mockKey = { id: 'key_1', userId: 'user_other' } as any;
        vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce(mockKey);

        await expect(
          userService.deleteApiKey('user_1', 'key_1'),
        ).rejects.toThrow(ForbiddenError);
      });

      it('should delete key if owner matches', async () => {
        const mockKey = { id: 'key_1', userId: 'user_1' } as any;
        vi.mocked(prisma.apiKey.findUnique).mockResolvedValueOnce(mockKey);
        vi.mocked(prisma.apiKey.delete).mockResolvedValueOnce({} as any);

        await userService.deleteApiKey('user_1', 'key_1');

        expect(prisma.apiKey.delete).toHaveBeenCalledWith({
          where: { id: 'key_1' },
        });
      });
    });
  });
});
