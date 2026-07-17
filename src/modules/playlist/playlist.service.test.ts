import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as playlistService from './playlist.service';
import { prisma } from '../../lib/prisma';
import { fgaClient } from '../../lib/fga.client';
import { getUserTier, UserTier } from '../users/user.service';
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

describe('PlaylistService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPlaylist', () => {
    it('should throw PaymentRequiredError if playlist limit is reached', async () => {
      vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);
      vi.mocked(getUserTier).mockReturnValue(UserTier.FREE);
      vi.mocked(prisma.playlist.count).mockResolvedValueOnce(3); // Limit for FREE is 3

      await expect(
        playlistService.createPlaylist('user_1', {
          name: 'My Playlist',
          isPublic: true,
        }),
      ).rejects.toThrow(PaymentRequiredError);
    });

    it('should throw PaymentRequiredError if trying to create a private playlist on FREE tier', async () => {
      vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);
      vi.mocked(getUserTier).mockReturnValue(UserTier.FREE);
      vi.mocked(prisma.playlist.count).mockResolvedValueOnce(0);

      await expect(
        playlistService.createPlaylist('user_1', {
          name: 'My Private Playlist',
          isPublic: false, // Private
        }),
      ).rejects.toThrow(PaymentRequiredError);
    });

    it('should successfully create playlist and write FGA tuples on success', async () => {
      const mockPlaylist = {
        id: 'playlist_1',
        userId: 'user_1',
        name: 'My Playlist',
        isPublic: true,
      } as any;

      vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);
      vi.mocked(getUserTier).mockReturnValue(UserTier.FREE);
      vi.mocked(prisma.playlist.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.playlist.create).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(fgaClient.write).mockResolvedValueOnce({} as any);

      const result = await playlistService.createPlaylist('user_1', {
        name: 'My Playlist',
        isPublic: true,
      });

      expect(prisma.playlist.create).toHaveBeenCalledWith({
        data: {
          userId: 'user_1',
          name: 'My Playlist',
          isPublic: true,
          thumbnailUrl: undefined,
        },
      });
      expect(fgaClient.write).toHaveBeenCalledWith({
        writes: [
          {
            user: 'user:user_1',
            relation: 'owner',
            object: 'playlist:playlist_1',
          },
          {
            user: 'platform:mainApp',
            relation: 'platform_ref',
            object: 'playlist:playlist_1',
          },
        ],
      });
      expect(result).toEqual(mockPlaylist);
    });

    it('should throw BadRequestError if FGA tuple write fails', async () => {
      const mockPlaylist = {
        id: 'playlist_1',
        userId: 'user_1',
        name: 'My Playlist',
        isPublic: true,
      } as any;

      vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);
      vi.mocked(getUserTier).mockReturnValue(UserTier.FREE);
      vi.mocked(prisma.playlist.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.playlist.create).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(fgaClient.write).mockRejectedValueOnce(new Error('FGA Failed'));

      await expect(
        playlistService.createPlaylist('user_1', {
          name: 'My Playlist',
          isPublic: true,
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('getPlaylistById', () => {
    it('should throw NotFoundError if playlist does not exist', async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(null);

      await expect(
        playlistService.getPlaylistById('user_1', 'playlist_1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if playlist is private and FGA access check fails', async () => {
      const mockPlaylist = {
        id: 'playlist_1',
        name: 'Private List',
        isPublic: false,
        userId: 'user_other',
        tracks: [],
      } as any;

      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        playlistService.getPlaylistById('user_1', 'playlist_1'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should return playlist and map tracks on success', async () => {
      const mockPlaylist = {
        id: 'playlist_1',
        name: 'Public List',
        isPublic: true,
        userId: 'user_2',
        tracks: [
          {
            position: 1,
            addedAt: new Date(),
            track: {
              id: 'track_1',
              title: 'Song 1',
              state: 'ready',
              likes: [{ userId: 'user_1' }],
            },
          },
        ],
      } as any;

      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(mockPlaylist);

      const result = await playlistService.getPlaylistById(
        'user_1',
        'playlist_1',
      );

      expect(result.name).toBe('Public List');
      expect(result.tracks.length).toBe(1);
      expect(result.tracks[0].id).toBe('track_1');
      expect(result.tracks[0].isLiked).toBe(true);
    });
  });

  describe('updatePlaylist', () => {
    it('should throw ForbiddenError if FGA check fails', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        playlistService.updatePlaylist('user_1', 'playlist_1', {
          name: 'New Name',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if playlist does not exist', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(null);

      await expect(
        playlistService.updatePlaylist('user_1', 'playlist_1', {
          name: 'New Name',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deletePlaylist', () => {
    it('should throw ForbiddenError if FGA delete check fails', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        playlistService.deletePlaylist('user_1', 'playlist_1'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if playlist does not exist', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(null);

      await expect(
        playlistService.deletePlaylist('user_1', 'playlist_1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should successfully delete playlist and FGA tuples', async () => {
      const mockPlaylist = {
        id: 'playlist_1',
        userId: 'user_1',
      } as any;

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(prisma.playlist.delete).mockResolvedValueOnce({} as any);
      vi.mocked(fgaClient.write).mockResolvedValueOnce({} as any);

      await playlistService.deletePlaylist('user_1', 'playlist_1');

      expect(prisma.playlist.delete).toHaveBeenCalledWith({
        where: { id: 'playlist_1' },
      });
      expect(fgaClient.write).toHaveBeenCalledWith({
        deletes: [
          {
            user: 'user:user_1',
            relation: 'owner',
            object: 'playlist:playlist_1',
          },
          {
            user: 'platform:mainApp',
            relation: 'platform_ref',
            object: 'playlist:playlist_1',
          },
        ],
      });
    });
  });

  describe('addTracksToPlaylist', () => {
    it('should throw PaymentRequiredError if track capacity limit is exceeded', async () => {
      const mockPlaylist = { id: 'playlist_1', userId: 'user_1' } as any;
      const mockTracks = [
        { id: 'track_1', state: 'ready' },
        { id: 'track_2', state: 'ready' },
        { id: 'track_3', state: 'ready' },
        { id: 'track_4', state: 'ready' },
        { id: 'track_5', state: 'ready' },
        { id: 'track_6', state: 'ready' },
      ];

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(prisma.track.findMany).mockResolvedValueOnce(mockTracks as any);
      vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);
      vi.mocked(getUserTier).mockReturnValue(UserTier.FREE);
      vi.mocked(prisma.playlistTrack.count).mockResolvedValueOnce(45); // FREE limit is 50

      await expect(
        playlistService.addTracksToPlaylist('user_1', 'playlist_1', [
          'track_1',
          'track_2',
          'track_3',
          'track_4',
          'track_5',
          'track_6',
        ]),
      ).rejects.toThrow(PaymentRequiredError);
    });

    it('should add tracks successfully if capacity allows', async () => {
      const mockPlaylist = { id: 'playlist_1', userId: 'user_1' } as any;
      const mockTracks = [{ id: 'track_1', state: 'ready' }];

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(prisma.track.findMany).mockResolvedValueOnce(mockTracks as any);
      vi.mocked(prisma.subscription.findMany).mockResolvedValueOnce([]);
      vi.mocked(getUserTier).mockReturnValue(UserTier.FREE);
      vi.mocked(prisma.playlistTrack.count).mockResolvedValueOnce(10);
      vi.mocked(prisma.playlistTrack.findFirst).mockResolvedValueOnce({
        position: 2,
      } as any);
      vi.mocked(prisma.playlistTrack.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.playlistTrack.createMany).mockResolvedValueOnce(
        {} as any,
      );

      await playlistService.addTracksToPlaylist('user_1', 'playlist_1', [
        'track_1',
      ]);

      expect(prisma.playlistTrack.createMany).toHaveBeenCalled();
    });
  });

  describe('updatePlaylist reordering', () => {
    it('should successfully update metadata and handle track order shifts', async () => {
      const mockPlaylist = {
        id: 'playlist_1',
        userId: 'user_1',
        tracks: [{ trackId: 'track_1' }],
      } as any;

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(prisma.playlistTrack.findMany).mockResolvedValueOnce([
        { trackId: 'track_1' },
      ] as any);
      vi.mocked(prisma.playlist.update).mockResolvedValueOnce({
        id: 'playlist_1',
      } as any);

      await playlistService.updatePlaylist('user_1', 'playlist_1', {
        name: 'New Title',
        trackOrder: ['track_1'],
      });

      expect(prisma.playlist.update).toHaveBeenCalled();
    });
  });

  describe('removeTrackFromPlaylist', () => {
    it('should throw NotFoundError if track is not in the playlist', async () => {
      const mockPlaylist = { id: 'playlist_1', userId: 'user_1' } as any;
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(prisma.playlistTrack.findUnique).mockResolvedValueOnce(null); // not in playlist

      await expect(
        playlistService.removeTrackFromPlaylist(
          'user_1',
          'playlist_1',
          'track_1',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should delete the track and shift other positions sequentially', async () => {
      const mockPlaylist = { id: 'playlist_1', userId: 'user_1' } as any;
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.playlist.findUnique).mockResolvedValueOnce(mockPlaylist);
      vi.mocked(prisma.playlistTrack.findUnique).mockResolvedValueOnce({
        playlistId: 'playlist_1',
        trackId: 'track_1',
        position: 1,
      } as any);
      vi.mocked(prisma.playlistTrack.delete).mockResolvedValueOnce({} as any);
      vi.mocked(prisma.playlistTrack.findMany).mockResolvedValueOnce([
        { trackId: 'track_2', position: 2 },
      ] as any);

      await playlistService.removeTrackFromPlaylist(
        'user_1',
        'playlist_1',
        'track_1',
      );

      expect(prisma.playlistTrack.delete).toHaveBeenCalled();
    });
  });

  describe('searchPlaylists', () => {
    it('should return list of matching public playlists', async () => {
      vi.mocked(prisma.playlist.findMany).mockResolvedValueOnce([
        { id: 'playlist_1', name: 'Rap Classics', isPublic: true },
      ] as any);

      const result = await playlistService.searchPlaylists(
        'user_1',
        'Rap',
        undefined,
        10,
      );

      expect(result.data.length).toBe(1);
    });
  });

  describe('getUserPlaylists', () => {
    it('should fetch user public and own playlists', async () => {
      vi.mocked(prisma.playlist.findMany).mockResolvedValueOnce([
        { id: 'playlist_1', name: 'My List', isPublic: false },
      ] as any);

      const result = await playlistService.getUserPlaylists(
        'user_1',
        'user_1',
        undefined,
        10,
      );

      expect(result.data.length).toBe(1);
    });
  });
});
