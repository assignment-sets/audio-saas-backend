import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../app';
import * as albumService from './album.service';
import { logger } from '../../config/logging_setup/logger';

beforeAll(() => {
  logger.level = 'silent';
});

vi.mock('../../middleware/rateLimit/rateLimiter.middleware', () => ({
  createRateLimiter: () => async (req: any, res: any, next: any) => next(),
}));

vi.mock('./album.service', () => ({
  createAlbum: vi.fn(),
  updateAlbum: vi.fn(),
  publishAlbum: vi.fn(),
  deleteAlbum: vi.fn(),
  getAlbumById: vi.fn(),
  getAlbumsByArtist: vi.fn(),
}));

vi.mock('../../config/env_setup/env', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/env_setup/env')>();
  return {
    env: {
      ...actual.env,
      AUTH0_AUDIENCE: 'https://test.audiosass.com',
      AUTH0_DOMAIN: 'dev-eu86qy2rzdy3nf6d.us.auth0.com',
      AUTH0_TOKEN_SIGNING_ALGO: 'RS256',
    },
  };
});

vi.mock('../../middleware/auth/requireAuth.middleware', () => ({
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

vi.mock('../../middleware/auth/optionalAuth.middleware', () => ({
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

describe('AlbumController Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/album', () => {
    it('should fail validation (400) if artistId is not a UUID', async () => {
      const response = await request(app)
        .post('/api/album')
        .send({ artistId: 'not-a-uuid', title: 'Test Album' });

      expect(response.status).toBe(400);
    });

    it('should successfully create a new album (201)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockAlbum = {
        id: 'album_1',
        artistId: uuid,
        title: 'Test Album',
        status: 'DRAFT',
      };
      vi.mocked(albumService.createAlbum).mockResolvedValueOnce(
        mockAlbum as any,
      );

      const response = await request(app)
        .post('/api/album')
        .send({ artistId: uuid, title: 'Test Album' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockAlbum);
      expect(albumService.createAlbum).toHaveBeenCalledWith('test-user-id', {
        artistId: uuid,
        title: 'Test Album',
      });
    });
  });

  describe('PATCH /api/album/:id', () => {
    it('should fail validation if ID is not a UUID', async () => {
      const response = await request(app)
        .patch('/api/album/not-a-uuid')
        .send({ title: 'New Title' });

      expect(response.status).toBe(400);
    });

    it('should update album metadata successfully', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockAlbum = { id: uuid, title: 'New Title', status: 'DRAFT' };
      vi.mocked(albumService.updateAlbum).mockResolvedValueOnce(
        mockAlbum as any,
      );

      const response = await request(app)
        .patch(`/api/album/${uuid}`)
        .send({ title: 'New Title' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAlbum);
      expect(albumService.updateAlbum).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        {
          title: 'New Title',
        },
      );
    });
  });

  describe('POST /api/album/:id/publish', () => {
    it('should publish album successfully', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockAlbum = { id: uuid, title: 'Test Album', status: 'PUBLISHED' };
      vi.mocked(albumService.publishAlbum).mockResolvedValueOnce(
        mockAlbum as any,
      );

      const response = await request(app).post(`/api/album/${uuid}/publish`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAlbum);
      expect(albumService.publishAlbum).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('DELETE /api/album/:id', () => {
    it('should delete album successfully (204)', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(albumService.deleteAlbum).mockResolvedValueOnce();

      const response = await request(app).delete(`/api/album/${uuid}`);

      expect(response.status).toBe(204);
      expect(albumService.deleteAlbum).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('GET /api/album/:id', () => {
    it('should get album details successfully', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockAlbum = { id: uuid, title: 'Test Album', status: 'PUBLISHED' };
      vi.mocked(albumService.getAlbumById).mockResolvedValueOnce(
        mockAlbum as any,
      );

      const response = await request(app).get(`/api/album/${uuid}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAlbum);
      expect(albumService.getAlbumById).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
      );
    });
  });

  describe('GET /api/album/artist/:artistId', () => {
    it('should return list of albums for an artist', async () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockResult = { albums: [], nextCursor: null, hasMore: false };
      vi.mocked(albumService.getAlbumsByArtist).mockResolvedValueOnce(
        mockResult,
      );

      const response = await request(app)
        .get(`/api/album/artist/${uuid}`)
        .query({ limit: '10' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResult);
      expect(albumService.getAlbumsByArtist).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        10,
        undefined,
      );
    });
  });
});
