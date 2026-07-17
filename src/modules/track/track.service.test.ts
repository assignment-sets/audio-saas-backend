import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as trackService from './track.service';
import { prisma } from '../../lib/prisma';
import { fgaClient } from '../../lib/fga.client';
import { cacheRedis } from '../../lib/cacheRedis.client';
import { engagementRedis } from '../../lib/engagementRedis.client';
import { addTrackJob } from '../../lib/queue.client';
import { NotFoundError, ForbiddenError } from '../../lib/errors';
import { Prisma } from '@prisma/client';

describe('TrackService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTracksByArtist', () => {
    it('should retrieve only ready tracks and map isLiked correctly', async () => {
      const mockTracks = [
        {
          id: 'track_1',
          title: 'Song A',
          state: 'ready',
          likes: [{ userId: 'user_1' }],
        },
        { id: 'track_2', title: 'Song B', state: 'ready', likes: [] },
      ];

      vi.mocked(prisma.track.findMany).mockResolvedValueOnce(mockTracks as any);

      const result = await trackService.getTracksByArtist(
        'artist_1',
        'user_1',
        10,
      );

      expect(prisma.track.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { artistId: 'artist_1', state: 'ready' },
        }),
      );
      expect(result.tracks[0].isLiked).toBe(true);
      expect(result.tracks[1].isLiked).toBe(false);
    });
  });

  describe('getTrackById', () => {
    it('should throw ForbiddenError if user cannot edit the track', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        trackService.getTrackById('user_1', 'track_1'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if track is not found', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(cacheRedis.get).mockResolvedValueOnce(null);
      vi.mocked(prisma.track.findUnique).mockResolvedValueOnce(null);

      await expect(
        trackService.getTrackById('user_1', 'track_1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should retrieve track from database and cache it on cache miss', async () => {
      const mockTrack = {
        id: 'track_1',
        title: 'Song A',
        state: 'ready',
        artist: { artistName: 'Artist A', id: 'artist_1' },
        album: null,
      };

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(cacheRedis.get).mockResolvedValueOnce(null);
      vi.mocked(prisma.track.findUnique).mockResolvedValueOnce(
        mockTrack as any,
      );
      vi.mocked(prisma.trackLike.findUnique).mockResolvedValueOnce({
        userId: 'user_1',
      } as any);

      const result = await trackService.getTrackById('user_1', 'track_1');

      expect(prisma.track.findUnique).toHaveBeenCalledWith({
        where: { id: 'track_1' },
        include: {
          artist: { select: { artistName: true, id: true } },
          album: { select: { title: true, id: true } },
        },
      });
      expect(cacheRedis.set).toHaveBeenCalledWith(
        'track:metadata:track_1',
        JSON.stringify(mockTrack),
        'EX',
        86400,
      );
      expect(result.isLiked).toBe(true);
    });
  });

  describe('createTrack', () => {
    it('should throw ForbiddenError if user cannot manage artist profile', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: false,
      } as any);

      await expect(
        trackService.createTrack('user_1', {
          artistId: 'artist_1',
          title: 'Song A',
          durationSeconds: 180,
          audioUrl: 's3://path',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should create track in processing state, create outbox task, and queue transcode job', async () => {
      const mockTrack = { id: 'track_1', artistId: 'artist_1' } as any;
      const mockOutbox = { id: 'outbox_1' } as any;

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.track.create).mockResolvedValueOnce(mockTrack);
      vi.mocked(prisma.outbox.create).mockResolvedValueOnce(mockOutbox);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce({
        artistName: 'Artist A',
      } as any);

      const result = await trackService.createTrack('user_1', {
        artistId: 'artist_1',
        title: 'Song A',
        durationSeconds: 180,
        audioUrl: 's3://path',
      });

      expect(prisma.track.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          state: 'processing',
          title: 'Song A',
        }),
      });
      expect(prisma.outbox.create).toHaveBeenCalled();
      expect(addTrackJob).toHaveBeenCalled();
      expect(result).toEqual(mockTrack);
    });
  });

  describe('processTranscodeWebhook', () => {
    it('should set track state to ready on webhook success', async () => {
      await trackService.processTranscodeWebhook(
        'track_1',
        'outbox_1',
        'success',
        'https://hls-path.m3u8',
      );

      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track_1' },
        data: { state: 'ready', audioUrl: 'https://hls-path.m3u8' },
      });
      expect(prisma.outbox.update).toHaveBeenCalledWith({
        where: { id: 'outbox_1' },
        data: { status: 'COMPLETED' },
      });
    });

    it('should set track state to failed on webhook failure', async () => {
      await trackService.processTranscodeWebhook(
        'track_1',
        'outbox_1',
        'failed',
        undefined,
        'Transcode error description',
      );

      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track_1' },
        data: { state: 'failed' },
      });
      expect(prisma.outbox.update).toHaveBeenCalledWith({
        where: { id: 'outbox_1' },
        data: { status: 'FAILED', lastError: 'Transcode error description' },
      });
    });
  });

  describe('recordPlay', () => {
    it('should push play event details to Redis queue', async () => {
      await trackService.recordPlay('user_1', 'track_1', 120);

      expect(engagementRedis.rpush).toHaveBeenCalledWith(
        'engagement:track-plays',
        expect.stringContaining('"trackId":"track_1"'),
      );
    });
  });

  describe('generateAudioUploadUrl', () => {
    it('should generate S3 presigned URL for upload', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);

      const result = await trackService.generateAudioUploadUrl(
        'user_1',
        'artist_1',
        'song.mp3',
        'audio/mpeg',
        5000000,
      );

      expect(result.url).toBe('https://mock-s3-signed-url.com');
      expect(result.key).toContain('raw-tracks/artist_1/');
    });
  });

  describe('updateTrack', () => {
    it('should successfully update track details and evict cache', async () => {
      const mockTrack = {
        id: 'track_1',
        artistId: 'artist_1',
        title: 'Song A',
      } as any;
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.track.update).mockResolvedValueOnce(mockTrack);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce({
        artistName: 'Artist A',
      } as any);

      const result = await trackService.updateTrack('user_1', 'track_1', {
        title: 'New Song A',
      });

      expect(prisma.track.update).toHaveBeenCalled();
      expect(cacheRedis.del).toHaveBeenCalledWith('track:metadata:track_1');
    });
  });

  describe('deleteTrack', () => {
    it('should set track state to deleted, create outbox row, and queue job', async () => {
      const mockTrack = { id: 'track_1', artistId: 'artist_1' } as any;
      const mockOutbox = { id: 'outbox_1' } as any;

      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.track.update).mockResolvedValueOnce(mockTrack);
      vi.mocked(prisma.outbox.create).mockResolvedValueOnce(mockOutbox);
      vi.mocked(prisma.artistProfile.findUnique).mockResolvedValueOnce({
        artistName: 'Artist A',
      } as any);

      await trackService.deleteTrack('user_1', 'track_1');

      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track_1' },
        data: { state: 'deleted' },
      });
      expect(addTrackJob).toHaveBeenCalled();
    });
  });

  describe('unlikeTrack', () => {
    it('should swallow Prisma P2025 error if user is unliking a non-liked track', async () => {
      const p2025Error = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        },
      );
      vi.mocked(prisma.trackLike.delete).mockRejectedValueOnce(p2025Error);

      await expect(
        trackService.unlikeTrack('user_1', 'track_1'),
      ).resolves.not.toThrow();
    });
  });

  describe('processBatchPlays', () => {
    it('should write plays to database for matching ready tracks and users', async () => {
      vi.mocked(prisma.track.findMany).mockResolvedValueOnce([
        { id: 'track_1' },
      ] as any);
      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        { id: 'user_1' },
      ] as any);
      vi.mocked(prisma.trackPlay.createMany).mockResolvedValueOnce({} as any);

      await trackService.processBatchPlays([
        { userId: 'user_1', trackId: 'track_1', durationPlayedSeconds: 120 },
      ]);

      expect(prisma.trackPlay.createMany).toHaveBeenCalled();
    });
  });

  describe('getTracksByArtistDashboard', () => {
    it('should fetch all non-deleted tracks for dashboard', async () => {
      vi.mocked(fgaClient.check).mockResolvedValueOnce({
        allowed: true,
      } as any);
      vi.mocked(prisma.track.findMany).mockResolvedValueOnce([
        { id: 'track_1', title: 'Song A', state: 'processing', likes: [] },
      ] as any);

      const result = await trackService.getTracksByArtistDashboard(
        'user_1',
        'artist_1',
        10,
      );

      expect(result.tracks.length).toBe(1);
    });
  });
});
