import { z } from 'zod';

export const albumIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const artistIdParamSchema = z.object({
  artistId: z.string().uuid(),
});

export const createAlbumSchema = z.object({
  artistId: z.string().uuid(),
  title: z.string().min(1).max(100),
  coverArtUrl: z.string().url().optional().nullable(),
  releaseDate: z.coerce.date().optional().nullable(),
});

export const updateAlbumSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  coverArtUrl: z.string().url().optional().nullable(),
  releaseDate: z.coerce.date().optional().nullable(),
  addTrackIds: z.array(z.string().uuid()).optional(),
  removeTrackIds: z.array(z.string().uuid()).optional(),
  trackOrder: z.array(z.string().uuid()).optional(),
});

export type CreateAlbumInput = z.infer<typeof createAlbumSchema>;
export type UpdateAlbumInput = z.infer<typeof updateAlbumSchema>;
