import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import * as userService from './user.service';
import { prisma } from '../../lib/prisma';

vi.mock('./user.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./user.service')>();
  return {
    ...actual,
    syncUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    createApiKey: vi.fn(),
    listApiKeys: vi.fn(),
    deleteApiKey: vi.fn(),
  };
});

describe('UserController Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/user/sync/internal', () => {
    it('should reject requests with missing sync secret header', async () => {
      const response = await request(app)
        .post('/api/v1/user/sync/internal')
        .send({ id: 'auth0|123', email: 'sync@example.com' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should reject requests with invalid sync secret header', async () => {
      const response = await request(app)
        .post('/api/v1/user/sync/internal')
        .set('x-sync-secret', 'wrong-secret')
        .send({ id: 'auth0|123', email: 'sync@example.com' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('should reject sync user if validation schema constraints fail', async () => {
      const response = await request(app)
        .post('/api/v1/user/sync/internal')
        .set('x-sync-secret', 'test-sync-secret')
        .send({ id: '', email: 'not-an-email' }); // Invalid fields

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should successfully sync user when secret and body are valid', async () => {
      const mockSyncedUser = {
        id: 'auth0|123',
        email: 'sync@example.com',
        displayName: 'sync',
      };
      vi.mocked(userService.syncUser).mockResolvedValueOnce(
        mockSyncedUser as any,
      );

      const response = await request(app)
        .post('/api/v1/user/sync/internal')
        .set('x-sync-secret', 'test-sync-secret')
        .send({ id: 'auth0|123', email: 'sync@example.com' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockSyncedUser);
      expect(userService.syncUser).toHaveBeenCalledWith({
        id: 'auth0|123',
        email: 'sync@example.com',
        displayName: 'sync',
      });
    });
  });

  describe('GET /api/v1/user', () => {
    it('should return 401 if request is unauthenticated', async () => {
      const response = await request(app)
        .get('/api/v1/user')
        .set('x-test-unauthenticated', 'true');

      expect(response.status).toBe(401);
    });

    it('should retrieve current user details, playlists, and managed profiles', async () => {
      const mockManagedProfiles = [{ id: 'artist_1', artistName: 'Naezy' }];
      const mockPlaylists = [{ id: 'playlist_1', name: 'My List' }];

      vi.mocked(prisma.artistManager.findMany).mockResolvedValueOnce([
        { artist: mockManagedProfiles[0] },
      ] as any);
      vi.mocked(prisma.playlist.findMany).mockResolvedValueOnce(
        mockPlaylists as any,
      );

      const response = await request(app).get('/api/v1/user');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'test-user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        managedProfiles: mockManagedProfiles,
        playlists: mockPlaylists,
      });
    });
  });

  describe('PATCH /api/v1/user', () => {
    it('should fail validation (400) if update payload is invalid', async () => {
      const response = await request(app)
        .patch('/api/v1/user')
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(400);
    });

    it('should successfully update user profile details', async () => {
      const mockUpdatedUser = {
        id: 'test-user-id',
        email: 'new@example.com',
        displayName: 'New Name',
      };
      vi.mocked(userService.updateUser).mockResolvedValueOnce(
        mockUpdatedUser as any,
      );

      const response = await request(app)
        .patch('/api/v1/user')
        .send({ email: 'new@example.com', displayName: 'New Name' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUpdatedUser);
      expect(userService.updateUser).toHaveBeenCalledWith('test-user-id', {
        email: 'new@example.com',
        displayName: 'New Name',
      });
    });
  });

  describe('DELETE /api/v1/user', () => {
    it('should soft-delete user and return 204', async () => {
      vi.mocked(userService.deleteUser).mockResolvedValueOnce();

      const response = await request(app).delete('/api/v1/user');

      expect(response.status).toBe(204);
      expect(userService.deleteUser).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('POST /api/v1/user/keys', () => {
    it('should fail with 400 if api key name is missing', async () => {
      const response = await request(app).post('/api/v1/user/keys').send({});

      expect(response.status).toBe(400);
    });

    it('should generate api key and return 201 on success', async () => {
      const mockKeyResult = {
        id: 'key_1',
        name: 'prod',
        rawKey: 'ak_live_abc',
        createdAt: new Date().toISOString(),
      };
      vi.mocked(userService.createApiKey).mockResolvedValueOnce(
        mockKeyResult as any,
      );

      const response = await request(app)
        .post('/api/v1/user/keys')
        .send({ name: 'prod' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockKeyResult);
      expect(userService.createApiKey).toHaveBeenCalledWith(
        'test-user-id',
        'prod',
      );
    });
  });

  describe('GET /api/v1/user/keys', () => {
    it('should return list of user API keys', async () => {
      const mockKeysList = [
        { id: 'key_1', name: 'prod', createdAt: new Date().toISOString() },
      ];
      vi.mocked(userService.listApiKeys).mockResolvedValueOnce(
        mockKeysList as any,
      );

      const response = await request(app).get('/api/v1/user/keys');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockKeysList);
      expect(userService.listApiKeys).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('DELETE /api/v1/user/keys/:id', () => {
    it('should fail validation (400) if ID is not a valid UUID', async () => {
      const response = await request(app).delete(
        '/api/v1/user/keys/not-a-uuid',
      );

      expect(response.status).toBe(400);
    });

    it('should successfully delete API key', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      vi.mocked(userService.deleteApiKey).mockResolvedValueOnce();

      const response = await request(app).delete(
        `/api/v1/user/keys/${validUuid}`,
      );

      expect(response.status).toBe(204);
      expect(userService.deleteApiKey).toHaveBeenCalledWith(
        'test-user-id',
        validUuid,
      );
    });
  });
});
