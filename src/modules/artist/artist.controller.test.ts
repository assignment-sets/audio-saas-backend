import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import * as artistService from './artist.service';

vi.mock('./artist.service', () => ({
  createProfile: vi.fn(),
  getProfileByName: vi.fn(),
  getProfileById: vi.fn(),
  updateProfile: vi.fn(),
  followArtist: vi.fn(),
  unfollowArtist: vi.fn(),
  checkFollowingStatus: vi.fn(),
  getArtistFollowers: vi.fn(),
  appointManager: vi.fn(),
  revokeManager: vi.fn(),
  listManagers: vi.fn(),
}));

describe('ArtistController Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/artist/:artistName', () => {
    it('should retrieve artist details by artistName', async () => {
      const mockResult = {
        id: 'artist_1',
        artistName: 'naezy',
        bio: 'rapper',
        verified: false,
      };
      vi.mocked(artistService.getProfileByName).mockResolvedValueOnce(
        mockResult as any,
      );

      const response = await request(app).get('/api/v1/artist/naezy');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(artistService.getProfileByName).toHaveBeenCalledWith(
        'naezy',
        'test-user-id',
      );
    });
  });

  describe('POST /api/v1/artist', () => {
    it('should fail validation (400) if artistName is too short', async () => {
      const response = await request(app)
        .post('/api/v1/artist')
        .send({ artistName: 'a', bio: 'too short name' });

      expect(response.status).toBe(400);
    });

    it('should successfully create current user artist profile (201)', async () => {
      const mockResult = {
        id: 'artist_1',
        userId: 'test-user-id',
        artistName: 'naezy',
        bio: 'rapper',
      };
      vi.mocked(artistService.createProfile).mockResolvedValueOnce(
        mockResult as any,
      );

      const response = await request(app)
        .post('/api/v1/artist')
        .send({ artistName: 'naezy', bio: 'rapper' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockResult);
      expect(artistService.createProfile).toHaveBeenCalledWith('test-user-id', {
        artistName: 'naezy',
        bio: 'rapper',
      });
    });
  });

  describe('PATCH /api/v1/artist/:id', () => {
    it('should fail validation (400) if ID is not a valid UUID', async () => {
      const response = await request(app)
        .patch('/api/v1/artist/not-a-uuid')
        .send({ bio: 'updated' });

      expect(response.status).toBe(400);
    });

    it('should update profile successfully (200)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockResult = {
        id: uuid,
        artistName: 'naezy-new',
        bio: 'updated bio',
      };
      vi.mocked(artistService.updateProfile).mockResolvedValueOnce(
        mockResult as any,
      );

      const response = await request(app)
        .patch(`/api/v1/artist/${uuid}`)
        .send({ artistName: 'naezy-new', bio: 'updated bio' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(artistService.updateProfile).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        {
          artistName: 'naezy-new',
          bio: 'updated bio',
        },
      );
    });
  });

  describe('POST /api/v1/artist/:id/follow', () => {
    it('should follow an artist successfully (201)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(artistService.followArtist).mockResolvedValueOnce();

      const response = await request(app).post(`/api/v1/artist/${uuid}/follow`);

      expect(response.status).toBe(201);
      expect(artistService.followArtist).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('DELETE /api/v1/artist/:id/follow', () => {
    it('should unfollow an artist successfully (204)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(artistService.unfollowArtist).mockResolvedValueOnce();

      const response = await request(app).delete(
        `/api/v1/artist/${uuid}/follow`,
      );

      expect(response.status).toBe(204);
      expect(artistService.unfollowArtist).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('POST /api/v1/artist/:id/managers', () => {
    it('should appoint a manager successfully (201)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(artistService.appointManager).mockResolvedValueOnce();

      const response = await request(app)
        .post(`/api/v1/artist/${uuid}/managers`)
        .send({ email: 'm@example.com' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        message: 'Manager appointed successfully.',
      });
      expect(artistService.appointManager).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        'm@example.com',
      );
    });
  });
});
