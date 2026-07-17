import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import * as trackService from './track.service';

vi.mock('./track.service', () => ({
  getTracksByArtist: vi.fn(),
  getTrackById: vi.fn(),
  createTrack: vi.fn(),
  processTranscodeWebhook: vi.fn(),
  updateTrack: vi.fn(),
  deleteTrack: vi.fn(),
  recordPlay: vi.fn(),
  likeTrack: vi.fn(),
  unlikeTrack: vi.fn(),
  generateAudioUploadUrl: vi.fn(),
  processBatchPlays: vi.fn(),
  getTracksByArtistDashboard: vi.fn(),
}));

describe('TrackController Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/track/artist/:artistId', () => {
    it('should fail validation (400) if artistId is not a UUID', async () => {
      const response = await request(app).get(
        '/api/v1/track/artist/not-a-uuid',
      );
      expect(response.status).toBe(400);
    });

    it('should successfully get artist tracks (200)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockResult = { tracks: [], nextCursor: null, hasMore: false };
      vi.mocked(trackService.getTracksByArtist).mockResolvedValueOnce(
        mockResult,
      );

      const response = await request(app).get(`/api/v1/track/artist/${uuid}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(trackService.getTracksByArtist).toHaveBeenCalledWith(
        uuid,
        'test-user-id',
        10,
        undefined,
      );
    });
  });

  describe('POST /api/v1/track/webhook/transcode', () => {
    it('should fail validation (400) if payload is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/track/webhook/transcode')
        .set('x-webhook-secret', 'test-webhook-secret')
        .send({ trackId: 'not-a-uuid' });

      expect(response.status).toBe(400);
    });

    it('should process webhook successfully (200)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const outboxUuid = '789e4567-e89b-12d3-a456-426614174000';
      vi.mocked(trackService.processTranscodeWebhook).mockResolvedValueOnce();

      const response = await request(app)
        .post('/api/v1/track/webhook/transcode')
        .set('x-webhook-secret', 'test-webhook-secret')
        .send({
          trackId: uuid,
          outboxId: outboxUuid,
          status: 'success',
          audioUrl: 'https://cdn.audiosass.com/hls/123/master.m3u8',
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      expect(trackService.processTranscodeWebhook).toHaveBeenCalledWith(
        uuid,
        outboxUuid,
        'success',
        'https://cdn.audiosass.com/hls/123/master.m3u8',
        undefined,
      );
    });
  });

  describe('POST /api/v1/track/:id/play', () => {
    it('should record a play event successfully (202)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(trackService.recordPlay).mockResolvedValueOnce();

      const response = await request(app)
        .post(`/api/v1/track/${uuid}/play`)
        .send({ durationPlayedSeconds: 45 });

      expect(response.status).toBe(202);
      expect(trackService.recordPlay).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        45,
      );
    });
  });

  describe('POST /api/v1/track/:id/like', () => {
    it('should like a track successfully (201)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(trackService.likeTrack).mockResolvedValueOnce();

      const response = await request(app).post(`/api/v1/track/${uuid}/like`);

      expect(response.status).toBe(201);
      expect(trackService.likeTrack).toHaveBeenCalledWith('test-user-id', uuid);
    });
  });

  describe('DELETE /api/v1/track/:id/like', () => {
    it('should unlike a track successfully (204)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(trackService.unlikeTrack).mockResolvedValueOnce();

      const response = await request(app).delete(`/api/v1/track/${uuid}/like`);

      expect(response.status).toBe(204);
      expect(trackService.unlikeTrack).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('POST /api/v1/track/upload-url', () => {
    it('should generate an audio upload URL successfully (200)', async () => {
      const artistUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockResult = {
        url: 'https://s3.signed-url',
        key: 'raw-tracks/song.mp3',
      };
      vi.mocked(trackService.generateAudioUploadUrl).mockResolvedValueOnce(
        mockResult,
      );

      const response = await request(app)
        .post('/api/v1/track/upload-url')
        .send({
          artistId: artistUuid,
          fileName: 'song.mp3',
          contentType: 'audio/mpeg',
          fileSize: 4500000,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(trackService.generateAudioUploadUrl).toHaveBeenCalledWith(
        'test-user-id',
        artistUuid,
        'song.mp3',
        'audio/mpeg',
        4500000,
      );
    });
  });

  describe('GET /api/v1/track/:id', () => {
    it('should fetch single track metadata successfully (200)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockResult = { id: uuid, title: 'Song A' };
      vi.mocked(trackService.getTrackById).mockResolvedValueOnce(
        mockResult as any,
      );

      const response = await request(app).get(`/api/v1/track/${uuid}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(trackService.getTrackById).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('POST /api/v1/track', () => {
    it('should create new track record successfully (201)', async () => {
      const mockResult = { id: 'track_1', title: 'New Track' };
      vi.mocked(trackService.createTrack).mockResolvedValueOnce(
        mockResult as any,
      );

      const response = await request(app).post('/api/v1/track').send({
        artistId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'New Track',
        durationSeconds: 240,
        audioUrl: 's3://some-path',
      });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockResult);
    });
  });

  describe('PATCH /api/v1/track/:id', () => {
    it('should update track metadata successfully (200)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockResult = { id: uuid, title: 'Updated Title' };
      vi.mocked(trackService.updateTrack).mockResolvedValueOnce(
        mockResult as any,
      );

      const response = await request(app)
        .patch(`/api/v1/track/${uuid}`)
        .send({ title: 'Updated Title' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
    });
  });

  describe('DELETE /api/v1/track/:id', () => {
    it('should delete a track successfully (204)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(trackService.deleteTrack).mockResolvedValueOnce();

      const response = await request(app).delete(`/api/v1/track/${uuid}`);

      expect(response.status).toBe(204);
      expect(trackService.deleteTrack).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('POST /api/v1/track/webhook/batch-plays', () => {
    it('should process batch plays webhook successfully (200)', async () => {
      vi.mocked(trackService.processBatchPlays).mockResolvedValueOnce();

      const response = await request(app)
        .post('/api/v1/track/webhook/batch-plays')
        .set('x-webhook-secret', 'test-webhook-secret')
        .send({
          plays: [
            {
              trackId: '123e4567-e89b-12d3-a456-426614174000',
              durationPlayedSeconds: 100,
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      expect(trackService.processBatchPlays).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/track/artist/:artistId/dashboard', () => {
    it('should fetch artist dashboard tracks (200)', async () => {
      const artistUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockResult = { tracks: [], nextCursor: null, hasMore: false };
      vi.mocked(trackService.getTracksByArtistDashboard).mockResolvedValueOnce(
        mockResult,
      );

      const response = await request(app).get(
        `/api/v1/track/artist/${artistUuid}/dashboard`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
    });
  });
});
