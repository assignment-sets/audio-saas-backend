import { z } from 'zod';
import type { ArtistProfile, Album, Track } from '@prisma/client';

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

export const getFollowersQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type GetFollowersQueryInput = z.infer<typeof getFollowersQuerySchema>;

export interface ArtistProfileWithRelations extends ArtistProfile {
  user: {
    isBlocked: boolean;
  } | null;
  albums: Album[];
  tracks: Array<Track & { isLiked: boolean }>;
  _count: {
    followers: number;
    tracks: number;
    albums: number;
  };
}

export const appointManagerSchema = z.object({
  email: z.string().email(),
});

export type AppointManagerInput = z.infer<typeof appointManagerSchema>;

export const manageManagerParamSchema = z.object({
  id: z.string().uuid(),
  managerId: z.string().min(1),
});

export type ManageManagerParamInput = z.infer<typeof manageManagerParamSchema>;
