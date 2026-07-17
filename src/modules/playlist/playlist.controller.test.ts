import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import * as playlistService from './playlist.service';

vi.mock('./playlist.service', () => ({
  createPlaylist: vi.fn(),
  getPlaylistById: vi.fn(),
  updatePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  addTracksToPlaylist: vi.fn(),
  removeTrackFromPlaylist: vi.fn(),
  searchPlaylists: vi.fn(),
  getUserPlaylists: vi.fn(),
}));

describe('PlaylistController Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/playlist', () => {
    it('should fail validation (400) if playlist name is empty', async () => {
      const response = await request(app)
        .post('/api/v1/playlist')
        .send({ name: '', isPublic: true });

      expect(response.status).toBe(400);
    });

    it('should successfully create a new playlist (201)', async () => {
      const mockPlaylist = {
        id: 'playlist_1',
        userId: 'test-user-id',
        name: 'Classical Hits',
        isPublic: true,
      };
      vi.mocked(playlistService.createPlaylist).mockResolvedValueOnce(
        mockPlaylist as any,
      );

      const response = await request(app)
        .post('/api/v1/playlist')
        .send({ name: 'Classical Hits', isPublic: true });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockPlaylist);
      expect(playlistService.createPlaylist).toHaveBeenCalledWith(
        'test-user-id',
        {
          name: 'Classical Hits',
          isPublic: true,
        },
      );
    });
  });

  describe('GET /api/v1/playlist/:id', () => {
    it('should fail validation (400) if ID is not a valid UUID', async () => {
      const response = await request(app).get('/api/v1/playlist/not-a-uuid');
      expect(response.status).toBe(400);
    });

    it('should successfully retrieve a playlist (200)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockPlaylist = {
        id: uuid,
        name: 'Indie Gems',
        isPublic: true,
        tracks: [],
      };
      vi.mocked(playlistService.getPlaylistById).mockResolvedValueOnce(
        mockPlaylist as any,
      );

      const response = await request(app).get(`/api/v1/playlist/${uuid}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPlaylist);
      expect(playlistService.getPlaylistById).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });

    it('should successfully retrieve a playlist as guest (200)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockPlaylist = {
        id: uuid,
        name: 'Indie Gems',
        isPublic: true,
        tracks: [],
      };
      vi.mocked(playlistService.getPlaylistById).mockResolvedValueOnce(
        mockPlaylist as any,
      );

      const response = await request(app)
        .get(`/api/v1/playlist/${uuid}`)
        .set('x-test-unauthenticated', 'true');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPlaylist);
      expect(playlistService.getPlaylistById).toHaveBeenCalledWith(null, uuid);
    });
  });

  describe('PATCH /api/v1/playlist/:id', () => {
    it('should fail validation (400) if target ID is invalid', async () => {
      const response = await request(app)
        .patch('/api/v1/playlist/not-a-uuid')
        .send({ name: 'New Name' });

      expect(response.status).toBe(400);
    });

    it('should update metadata successfully (200)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockPlaylist = {
        id: uuid,
        name: 'Updated Name',
        isPublic: false,
      };
      vi.mocked(playlistService.updatePlaylist).mockResolvedValueOnce(
        mockPlaylist as any,
      );

      const response = await request(app)
        .patch(`/api/v1/playlist/${uuid}`)
        .send({ name: 'Updated Name', isPublic: false });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPlaylist);
      expect(playlistService.updatePlaylist).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        {
          name: 'Updated Name',
          isPublic: false,
        },
      );
    });
  });

  describe('DELETE /api/v1/playlist/:id', () => {
    it('should delete the playlist successfully (204)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(playlistService.deletePlaylist).mockResolvedValueOnce();

      const response = await request(app).delete(`/api/v1/playlist/${uuid}`);

      expect(response.status).toBe(204);
      expect(playlistService.deletePlaylist).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('POST /api/v1/playlist/:id/tracks', () => {
    it('should add tracks successfully (201)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const trackUuid = '987f6543-e21b-32d3-b456-123412341234';
      vi.mocked(playlistService.addTracksToPlaylist).mockResolvedValueOnce();

      const response = await request(app)
        .post(`/api/v1/playlist/${uuid}/tracks`)
        .send({ trackIds: [trackUuid] });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Tracks added successfully.' });
      expect(playlistService.addTracksToPlaylist).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        [trackUuid],
      );
    });
  });

  describe('DELETE /api/v1/playlist/:id/tracks/:trackId', () => {
    it('should remove a track successfully (204)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const trackUuid = '987f6543-e21b-32d3-b456-123412341234';
      vi.mocked(
        playlistService.removeTrackFromPlaylist,
      ).mockResolvedValueOnce();

      const response = await request(app).delete(
        `/api/v1/playlist/${uuid}/tracks/${trackUuid}`,
      );

      expect(response.status).toBe(204);
      expect(playlistService.removeTrackFromPlaylist).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        trackUuid,
      );
    });
  });

  describe('GET /api/v1/playlist', () => {
    it('should search playlists as authenticated user (200)', async () => {
      const mockResult = { data: [], nextCursor: null, hasMore: false };
      vi.mocked(playlistService.searchPlaylists).mockResolvedValueOnce(
        mockResult,
      );

      const response = await request(app)
        .get('/api/v1/playlist')
        .query({ search: 'Rap', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(playlistService.searchPlaylists).toHaveBeenCalledWith(
        'test-user-id',
        'Rap',
        undefined,
        10,
      );
    });

    it('should search playlists as guest user (200)', async () => {
      const mockResult = { data: [], nextCursor: null, hasMore: false };
      vi.mocked(playlistService.searchPlaylists).mockResolvedValueOnce(
        mockResult,
      );

      const response = await request(app)
        .get('/api/v1/playlist')
        .query({ search: 'Rap', limit: 10 })
        .set('x-test-unauthenticated', 'true');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(playlistService.searchPlaylists).toHaveBeenCalledWith(
        null,
        'Rap',
        undefined,
        10,
      );
    });
  });

  describe('GET /api/v1/playlist/user/:userId', () => {
    it('should retrieve user playlists as authenticated user (200)', async () => {
      const mockResult = { data: [], nextCursor: null, hasMore: false };
      vi.mocked(playlistService.getUserPlaylists).mockResolvedValueOnce(
        mockResult,
      );

      const response = await request(app)
        .get('/api/v1/playlist/user/user_1')
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(playlistService.getUserPlaylists).toHaveBeenCalledWith(
        'test-user-id',
        'user_1',
        undefined,
        10,
      );
    });

    it('should retrieve user playlists as guest user (200)', async () => {
      const mockResult = { data: [], nextCursor: null, hasMore: false };
      vi.mocked(playlistService.getUserPlaylists).mockResolvedValueOnce(
        mockResult,
      );

      const response = await request(app)
        .get('/api/v1/playlist/user/user_1')
        .query({ limit: 10 })
        .set('x-test-unauthenticated', 'true');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(playlistService.getUserPlaylists).toHaveBeenCalledWith(
        null,
        'user_1',
        undefined,
        10,
      );
    });
  });
});
