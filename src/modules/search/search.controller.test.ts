import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import * as searchService from './search.service';

vi.mock('./search.service', () => ({
  searchAll: vi.fn(),
}));

describe('SearchController Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/search', () => {
    it('should fail validation (400) if search query is empty', async () => {
      const response = await request(app)
        .get('/api/v1/search')
        .query({ q: '' });
      expect(response.status).toBe(400);
    });

    it('should fail validation (400) if search query is missing', async () => {
      const response = await request(app).get('/api/v1/search');
      expect(response.status).toBe(400);
    });

    it('should succeed (200) and return search results', async () => {
      const mockResults = {
        artists: [],
        tracks: [],
        albums: [],
        playlists: [],
      };
      vi.mocked(searchService.searchAll).mockResolvedValueOnce(mockResults);

      const response = await request(app)
        .get('/api/v1/search')
        .query({ q: 'drizzy' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResults);
      expect(searchService.searchAll).toHaveBeenCalledWith(
        'drizzy',
        'test-user-id',
      );
    });

    it('should search as guest if unauthenticated', async () => {
      const mockResults = {
        artists: [],
        tracks: [],
        albums: [],
        playlists: [],
      };
      vi.mocked(searchService.searchAll).mockResolvedValueOnce(mockResults);

      const response = await request(app)
        .get('/api/v1/search')
        .set('x-test-unauthenticated', 'true')
        .query({ q: 'drizzy' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockResults);
      expect(searchService.searchAll).toHaveBeenCalledWith('drizzy', null);
    });
  });
});
