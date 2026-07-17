import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as searchService from './search.service';
import { prisma } from '../../lib/prisma';
import { cacheRedis } from '../../lib/cacheRedis.client';

describe('SearchService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchAll', () => {
    it('should return cached results on a cache hit', async () => {
      const mockCachedResults = {
        artists: [{ id: 'artist_1', artistName: 'Naezy' }],
        tracks: [{ id: 'track_1', title: 'Aafat' }],
        albums: [{ id: 'album_1', title: 'Maghreb' }],
        playlists: [{ id: 'playlist_1', name: 'Drizzy Classics' }],
      };

      vi.mocked(cacheRedis.get).mockResolvedValueOnce(
        JSON.stringify(mockCachedResults),
      );

      const result = await searchService.searchAll('Naezy', null);

      expect(cacheRedis.get).toHaveBeenCalledWith('search:raw:Naezy');
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(result.artists).toEqual(mockCachedResults.artists);
      expect(result.tracks[0].isLiked).toBe(false);
    });

    it('should fall back to DB on cache miss and cache the raw results', async () => {
      vi.mocked(cacheRedis.get).mockResolvedValueOnce(null);

      const mockArtists = [{ id: 'artist_1', artistName: 'Naezy' }];
      const mockTracks = [{ id: 'track_1', title: 'Aafat', state: 'ready' }];
      const mockAlbums = [{ id: 'album_1', title: 'Maghreb' }];
      const mockPlaylists = [{ id: 'playlist_1', name: 'Drizzy Classics' }];

      // Mock the 4 parallel $queryRaw queries
      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce(mockArtists)
        .mockResolvedValueOnce(mockTracks)
        .mockResolvedValueOnce(mockAlbums)
        .mockResolvedValueOnce(mockPlaylists);

      const result = await searchService.searchAll('Naezy', null);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
      expect(cacheRedis.set).toHaveBeenCalledWith(
        'search:raw:Naezy',
        JSON.stringify({
          artists: mockArtists,
          tracks: mockTracks,
          albums: mockAlbums,
          playlists: mockPlaylists,
        }),
        'EX',
        300,
      );
      expect(result.artists).toEqual(mockArtists);
      expect(result.tracks[0].isLiked).toBe(false);
    });

    it('should run ILIKE queries for short queries (length < 3)', async () => {
      vi.mocked(cacheRedis.get).mockResolvedValueOnce(null);

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await searchService.searchAll('ab', null);

      // Verify that the query uses ILIKE
      const calls = vi.mocked(prisma.$queryRaw).mock.calls;
      expect(calls.length).toBe(4);
      expect(JSON.stringify(calls[0][0])).toContain('ILIKE');
    });

    it('should run trigram similarity queries for long queries (length >= 3)', async () => {
      vi.mocked(cacheRedis.get).mockResolvedValueOnce(null);

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await searchService.searchAll('drizzy', null);

      // Verify that the query uses similarity % operator
      const calls = vi.mocked(prisma.$queryRaw).mock.calls;
      expect(calls.length).toBe(4);
      expect(JSON.stringify(calls[0][0])).toContain('%');
    });

    it('should hydrate isLiked status if userId is provided', async () => {
      const mockCachedResults = {
        artists: [],
        tracks: [
          { id: 'track_1', title: 'Track One' },
          { id: 'track_2', title: 'Track Two' },
        ],
        albums: [],
        playlists: [],
      };

      vi.mocked(cacheRedis.get).mockResolvedValueOnce(
        JSON.stringify(mockCachedResults),
      );
      vi.mocked(prisma.trackLike.findMany).mockResolvedValueOnce([
        { trackId: 'track_1' },
      ] as any);

      const result = await searchService.searchAll('drizzy', 'user_1');

      expect(prisma.trackLike.findMany).toHaveBeenCalledWith({
        where: { userId: 'user_1', trackId: { in: ['track_1', 'track_2'] } },
        select: { trackId: true },
      });
      expect(result.tracks[0].isLiked).toBe(true);
      expect(result.tracks[1].isLiked).toBe(false);
    });

    it('should swallow cache errors silently and proceed to query DB', async () => {
      vi.mocked(cacheRedis.get).mockRejectedValueOnce(
        new Error('Redis connection lost'),
      );

      vi.mocked(prisma.$queryRaw)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await searchService.searchAll('naezy', null);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
      expect(result.artists).toEqual([]);
    });
  });
});
