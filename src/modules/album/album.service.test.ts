import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as albumService from './album.service';
import { prisma } from '../../lib/prisma';
import { fgaClient } from '../../lib/fga.client';
import { cacheRedis } from '../../lib/cacheRedis.client';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../../lib/errors';

describe('AlbumService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAlbum', () => {
    it('should throw ForbiddenError if user is not authorized in FGA', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        albumService.createAlbum('user_1', {
          artistId: 'artist_1',
          title: 'My Album',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should create album in DRAFT status and write FGA tuples on success', async () => {
      const mockAlbum = {
        id: 'album_1',
        artistId: 'artist_1',
        title: 'My Album',
        status: 'DRAFT',
      } as any;

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.album.create).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.write).mockResolvedValueOnce({} as any);

      const result = await albumService.createAlbum('user_1', {
        artistId: 'artist_1',
        title: 'My Album',
      });

      expect(prisma.album.create).toHaveBeenCalledWith({
        data: {
          artistId: 'artist_1',
          title: 'My Album',
          coverArtUrl: undefined,
          releaseDate: undefined,
          status: 'DRAFT',
        },
      });
      expect(fgaClient.write).toHaveBeenCalledWith({
        writes: [
          {
            user: 'artist_profile:artist_1',
            relation: 'parent_artist',
            object: 'album:album_1',
          },
          {
            user: 'platform:mainApp',
            relation: 'platform_ref',
            object: 'album:album_1',
          },
        ],
      });
      expect(result).toEqual(mockAlbum);
    });

    it('should throw BadRequestError if writing FGA tuples fails', async () => {
      const mockAlbum = {
        id: 'album_1',
        artistId: 'artist_1',
        title: 'My Album',
        status: 'DRAFT',
      } as any;

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.album.create).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.write).mockRejectedValueOnce(new Error('FGA Failed'));

      await expect(
        albumService.createAlbum('user_1', {
          artistId: 'artist_1',
          title: 'My Album',
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('updateAlbum', () => {
    it('should throw ForbiddenError if user cannot manage the album', async () => {
      const mockAlbum = { id: 'album_1', status: 'DRAFT' } as any;
      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        albumService.updateAlbum('user_1', 'album_1', { title: 'New Title' }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if album does not exist', async () => {
      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(null);

      await expect(
        albumService.updateAlbum('user_1', 'album_1', { title: 'New Title' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should block tracklist modifications if album is PUBLISHED', async () => {
      const mockAlbum = { id: 'album_1', status: 'PUBLISHED' } as any;
      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);

      await expect(
        albumService.updateAlbum('user_1', 'album_1', {
          removeTrackIds: ['track_1'],
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it('should update metadata and evict cache successfully', async () => {
      const mockAlbum = {
        id: 'album_1',
        artistId: 'artist_1',
        status: 'DRAFT',
      } as any;
      const updatedAlbum = {
        id: 'album_1',
        artistId: 'artist_1',
        title: 'New Title',
        status: 'DRAFT',
      } as any;
      const mockArtist = { id: 'artist_1', artistName: 'naezy' } as any;

      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.album.update).mockResolvedValueOnce(updatedAlbum);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(
        mockArtist,
      );
      vi.mocked(cacheRedis.del).mockResolvedValue({} as any);

      const result = await albumService.updateAlbum('user_1', 'album_1', {
        title: 'New Title',
      });

      expect(prisma.album.update).toHaveBeenCalledWith({
        where: { id: 'album_1' },
        data: {
          title: 'New Title',
          coverArtUrl: undefined,
          releaseDate: undefined,
        },
      });
      expect(cacheRedis.del).toHaveBeenCalledWith('album:metadata:album_1');
      expect(cacheRedis.del).toHaveBeenCalledWith('artist:profile:naezy');
      expect(result).toEqual(updatedAlbum);
    });
  });

  describe('publishAlbum', () => {
    it('should validate album ready tracks and play duration successfully', async () => {
      const mockAlbum = {
        id: 'album_1',
        artistId: 'artist_1',
        status: 'DRAFT',
      } as any;
      const mockTracks = Array.from({ length: 8 }, (_, i) => ({
        id: `track_${i}`,
        artistId: 'artist_1',
        state: 'ready',
        durationSeconds: 200, // Total: 1600 seconds (~26 mins)
      })) as any[];

      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.track.findMany).mockResolvedValueOnce(mockTracks);
      vi.mocked(prisma.album.update).mockResolvedValueOnce({
        ...mockAlbum,
        status: 'PUBLISHED',
      });

      const result = await albumService.publishAlbum('user_1', 'album_1');

      expect(prisma.album.update).toHaveBeenCalledWith({
        where: { id: 'album_1' },
        data: { status: 'PUBLISHED' },
      });
      expect(result.status).toBe('PUBLISHED');
    });

    it('should throw BadRequestError if album has less than 7 ready tracks', async () => {
      const mockAlbum = {
        id: 'album_1',
        artistId: 'artist_1',
        status: 'DRAFT',
      } as any;
      const mockTracks = Array.from({ length: 5 }, (_, i) => ({
        id: `track_${i}`,
        artistId: 'artist_1',
        state: 'ready',
        durationSeconds: 200,
      })) as any[];

      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.track.findMany).mockResolvedValueOnce(mockTracks);

      await expect(
        albumService.publishAlbum('user_1', 'album_1'),
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if total duration is less than 20 mins', async () => {
      const mockAlbum = {
        id: 'album_1',
        artistId: 'artist_1',
        status: 'DRAFT',
      } as any;
      const mockTracks = Array.from({ length: 8 }, (_, i) => ({
        id: `track_${i}`,
        artistId: 'artist_1',
        state: 'ready',
        durationSeconds: 100, // Total: 800 seconds (~13 mins)
      })) as any[];

      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.track.findMany).mockResolvedValueOnce(mockTracks);

      await expect(
        albumService.publishAlbum('user_1', 'album_1'),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('deleteAlbum', () => {
    it('should delete album record and evict FGA/caches on success', async () => {
      const mockAlbum = { id: 'album_1', artistId: 'artist_1' } as any;
      const mockArtist = { id: 'artist_1', artistName: 'naezy' } as any;

      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(mockAlbum);
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.album.delete).mockResolvedValueOnce({} as any);
      vi.mocked(fgaClient.write).mockResolvedValueOnce({} as any);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(
        mockArtist,
      );

      await albumService.deleteAlbum('user_1', 'album_1');

      expect(prisma.album.delete).toHaveBeenCalledWith({
        where: { id: 'album_1' },
      });
      expect(fgaClient.write).toHaveBeenCalledWith({
        deletes: [
          {
            user: 'artist_profile:artist_1',
            relation: 'parent_artist',
            object: 'album:album_1',
          },
          {
            user: 'platform:mainApp',
            relation: 'platform_ref',
            object: 'album:album_1',
          },
        ],
      });
      expect(cacheRedis.del).toHaveBeenCalledWith('album:metadata:album_1');
      expect(cacheRedis.del).toHaveBeenCalledWith('artist:profile:naezy');
    });
  });

  describe('getAlbumById', () => {
    it('should return cached album immediately on hit', async () => {
      const cachedAlbum = { id: 'album_1', status: 'PUBLISHED', tracks: [] };
      vi.mocked(cacheRedis.get).mockResolvedValueOnce(
        JSON.stringify(cachedAlbum),
      );

      const result = await albumService.getAlbumById('user_1', 'album_1');

      expect(cacheRedis.get).toHaveBeenCalledWith('album:metadata:album_1');
      expect(prisma.album.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual(cachedAlbum);
    });

    it('should fetch from database, cache result, and dynamically map likes on miss', async () => {
      const mockAlbum = {
        id: 'album_1',
        status: 'PUBLISHED',
        tracks: [{ id: 'track_1', title: 'Song 1' }],
      } as any;
      const likedTrackRecords = [{ trackId: 'track_1' }] as any[];

      vi.mocked(cacheRedis.get).mockResolvedValueOnce(null);
      vi.mocked(prisma.album.findUnique).mockResolvedValueOnce(mockAlbum);
      vi.mocked(cacheRedis.set).mockResolvedValueOnce({} as any);
      vi.mocked(prisma.trackLike.findMany).mockResolvedValueOnce(
        likedTrackRecords,
      );

      const result = await albumService.getAlbumById('user_1', 'album_1');

      expect(prisma.album.findUnique).toHaveBeenCalledWith({
        where: { id: 'album_1' },
        include: { tracks: { orderBy: { trackNumber: 'asc' } } },
      });
      expect(cacheRedis.set).toHaveBeenCalledWith(
        'album:metadata:album_1',
        JSON.stringify(mockAlbum),
        'EX',
        86400,
      );
      expect(result.tracks[0].isLiked).toBe(true);
    });
  });

  describe('getAlbumsByArtist', () => {
    it('should retrieve all albums if user is manager', async () => {
      const mockArtist = { id: 'artist_1' } as any;
      const mockAlbums = [
        { id: 'album_1', status: 'DRAFT', tracks: [] },
      ] as any[];

      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(
        mockArtist,
      );
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.album.findMany).mockResolvedValueOnce(mockAlbums);

      const result = await albumService.getAlbumsByArtist(
        'user_1',
        'artist_1',
        10,
      );

      expect(prisma.album.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { artistId: 'artist_1' },
          include: {
            tracks: expect.any(Object),
          },
        }),
      );
      expect(result.albums.length).toBe(1);
    });

    it('should retrieve only published albums if user is public visitor', async () => {
      const mockArtist = { id: 'artist_1' } as any;
      const mockAlbums = [{ id: 'album_1', status: 'PUBLISHED' }] as any[];

      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce(
        mockArtist,
      );
      vi.mocked(prisma.album.findMany).mockResolvedValueOnce(mockAlbums);

      const result = await albumService.getAlbumsByArtist(null, 'artist_1', 10);

      expect(prisma.album.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { artistId: 'artist_1', status: 'PUBLISHED' },
        }),
      );
      expect(result.albums.length).toBe(1);
    });
  });
});
