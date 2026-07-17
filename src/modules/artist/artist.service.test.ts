import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as artistService from './artist.service';
import { prisma } from '../../lib/prisma';
import { fgaClient } from '../../lib/fga.client';
import { cacheRedis } from '../../lib/cacheRedis.client';
import { getUserTier, UserTier } from '../users/user.service';
import { Prisma } from '@prisma/client';
import { addArtistJob } from '../../lib/queue.client';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  PaymentRequiredError,
} from '../../lib/errors';

vi.mock('../users/user.service', () => ({
  getUserTier: vi.fn(),
  UserTier: {
    FREE: 'FREE',
    LITE: 'LITE',
    PRO: 'PRO',
  },
}));

describe('ArtistService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProfile', () => {
    it('should successfully create an artist profile and queue outbox task', async () => {
      const mockProfile = {
        id: 'artist_1',
        userId: 'user_1',
        artistName: 'Naezy',
        bio: 'rap artist',
        verified: false,
      } as any;
      const mockOutbox = { id: 'outbox_1' } as any;

      vi.mocked(prisma.artistProfile.create).mockResolvedValueOnce(mockProfile);
      vi.mocked(prisma.outbox.create).mockResolvedValueOnce(mockOutbox);

      const result = await artistService.createProfile('user_1', {
        artistName: 'Naezy',
        bio: 'rap artist',
      });

      expect(prisma.artistProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user_1',
          artistName: 'Naezy',
          bio: 'rap artist',
        },
      });
      expect(result).toEqual(mockProfile);
    });
  });

  describe('getProfileByName', () => {
    it('should throw NotFoundError if artist does not exist', async () => {
      vi.mocked(cacheRedis.get).mockResolvedValueOnce(null);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(null);

      await expect(
        artistService.getProfileByName('missing_artist'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should retrieve profile from cache if present', async () => {
      const cachedProfile = {
        id: 'artist_1',
        artistName: 'Naezy',
        tracks: [],
        user: { isBlocked: false },
      };
      vi.mocked(cacheRedis.get).mockResolvedValueOnce(
        JSON.stringify(cachedProfile),
      );

      const result = await artistService.getProfileByName('Naezy');

      expect(result.id).toBe('artist_1');
      expect(prisma.artistProfile.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getProfileById', () => {
    it('should throw ForbiddenError if requester lacks FGA permissions', async () => {
      vi.mocked(fgaClient.check).mockResolvedValue({ allowed: false } as any);

      await expect(
        artistService.getProfileById('artist_1', 'user_1'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should return profile on success', async () => {
      const mockProfile = { id: 'artist_1', artistName: 'Naezy' } as any;
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any); // manager check
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(
        mockProfile,
      );

      const result = await artistService.getProfileById('artist_1', 'user_1');

      expect(result).toEqual(mockProfile);
    });
  });

  describe('appointManager', () => {
    it('should throw ForbiddenError if requester is not the artist owner', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        artistService.appointManager('user_other', 'artist_1', 'm@example.com'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if target user email does not exist', async () => {
      const mockProfile = { id: 'artist_1', userId: 'user_owner' } as any;

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(
        mockProfile,
      );
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      await expect(
        artistService.appointManager(
          'user_owner',
          'artist_1',
          'missing@test.com',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw PaymentRequiredError if tier limits are exceeded', async () => {
      const mockProfile = { id: 'artist_1', userId: 'user_owner' } as any;
      const mockTargetUser = {
        id: 'user_manager',
        email: 'm@example.com',
        isBlocked: false,
      } as any;

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(
        mockProfile,
      );
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockTargetUser);
      vi.mocked(prisma.artistManager.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);
      vi.mocked(getUserTier).mockReturnValue(UserTier.FREE);
      vi.mocked(prisma.artistManager.count).mockResolvedValueOnce(1); // FREE manager limit is 1

      await expect(
        artistService.appointManager('user_owner', 'artist_1', 'm@example.com'),
      ).rejects.toThrow(PaymentRequiredError);
    });
  });

  describe('updateProfile', () => {
    it('should throw ForbiddenError if requester lacks edit access', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        artistService.updateProfile('user_other', 'artist_1', {
          bio: 'updated',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if artist profile does not exist', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      const p2025Error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        },
      );
      vi.mocked(prisma.artistProfile.update).mockRejectedValueOnce(p2025Error);

      await expect(
        artistService.updateProfile('user_owner', 'artist_1', {
          bio: 'updated',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should update profile and evict cache successfully', async () => {
      const mockProfile = {
        id: 'artist_1',
        artistName: 'Naezy',
        bio: 'rapper',
      } as any;
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.artistProfile.update).mockResolvedValueOnce({
        ...mockProfile,
        bio: 'updated bio',
      });

      const result = await artistService.updateProfile(
        'user_owner',
        'artist_1',
        {
          bio: 'updated bio',
        },
      );

      expect(prisma.artistProfile.update).toHaveBeenCalledWith({
        where: { id: 'artist_1' },
        data: { bio: 'updated bio' },
      });
      expect(cacheRedis.del).toHaveBeenCalledWith('artist:profile:Naezy');
      expect(result.bio).toBe('updated bio');
    });
  });

  describe('following operations', () => {
    it('should follow an artist if not already following', async () => {
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce({
        id: 'artist_1',
      } as any);
      vi.mocked(prisma.artistFollower.upsert).mockResolvedValueOnce({} as any);

      await artistService.followArtist('user_1', 'artist_1');

      expect(prisma.artistFollower.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_artistId: { userId: 'user_1', artistId: 'artist_1' },
          },
          create: { userId: 'user_1', artistId: 'artist_1' },
        }),
      );
    });

    it('should unfollow an artist', async () => {
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce({
        id: 'artist_1',
      } as any);
      vi.mocked(prisma.artistFollower.delete).mockResolvedValueOnce({} as any);

      await artistService.unfollowArtist('user_1', 'artist_1');

      expect(prisma.artistFollower.delete).toHaveBeenCalledWith({
        where: {
          userId_artistId: { userId: 'user_1', artistId: 'artist_1' },
        },
      });
    });

    it('should check if user is following an artist', async () => {
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce({
        id: 'artist_1',
      } as any);
      vi.mocked(prisma.artistFollower.findUnique).mockResolvedValueOnce(
        {} as any,
      );

      const isFollowing = await artistService.checkFollowingStatus(
        'user_1',
        'artist_1',
      );

      expect(isFollowing).toBe(true);
    });
  });

  describe('getArtistFollowers', () => {
    it('should retrieve list of followers with pagination', async () => {
      const mockFollowers = [
        {
          userId: 'user_2',
          user: { id: 'user_2', displayName: 'Follower A' },
        },
      ];
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce({
        id: 'artist_1',
      } as any);
      vi.mocked(prisma.artistFollower.findMany).mockResolvedValueOnce(
        mockFollowers as any,
      );

      const result = await artistService.getArtistFollowers('artist_1', 10);

      expect(prisma.artistFollower.findMany).toHaveBeenCalled();
      expect(result.followers.length).toBe(1);
    });
  });

  describe('revokeManager', () => {
    it('should throw ForbiddenError if requester is not the artist owner', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        artistService.revokeManager('user_other', 'artist_1', 'user_manager'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should revoke manager, write outbox task, and queue outbox job', async () => {
      const mockProfile = { id: 'artist_1', userId: 'user_owner' } as any;
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(
        mockProfile,
      );
      vi.mocked(prisma.artistManager.findUnique).mockResolvedValueOnce({
        userId: 'user_manager',
      } as any);
      vi.mocked(prisma.artistManager.delete).mockResolvedValueOnce({} as any);
      vi.mocked(prisma.outbox.create).mockResolvedValueOnce({
        id: 'outbox_1',
      } as any);

      await artistService.revokeManager(
        'user_owner',
        'artist_1',
        'user_manager',
      );

      expect(prisma.artistManager.delete).toHaveBeenCalled();
      expect(prisma.outbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'REVOKE_ARTIST_MANAGER',
          }),
        }),
      );
      expect(addArtistJob).toHaveBeenCalledWith('process-outbox', {
        outboxId: 'outbox_1',
      });
    });
  });

  describe('listManagers', () => {
    it('should throw ForbiddenError if requester is not authorized', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        artistService.listManagers('user_other', 'artist_1'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should return list of managers', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.artistManager.findMany).mockResolvedValueOnce([
        { userId: 'user_manager', user: { displayName: 'Manager A' } },
      ] as any);

      const result = await artistService.listManagers('user_owner', 'artist_1');

      expect(result.length).toBe(1);
    });
  });
});
