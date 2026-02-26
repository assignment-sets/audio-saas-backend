import { z } from 'zod';

// For validating UUIDs in URL params (get, update, delete)
export const artistIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const createArtistSchema = z.object({
  artistName: z.string().min(2).max(50),
  bio: z.string().max(500).optional(),
});

export const updateArtistSchema = z.object({
  artistName: z.string().min(2).max(50).optional(),
  bio: z.string().max(500).optional(),
});

export const getArtistByNameSchema = z.object({
  artistName: z.string().min(1),
});

export type CreateArtistInput = z.infer<typeof createArtistSchema>;
export type UpdateArtistInput = z.infer<typeof updateArtistSchema>;
