import { z } from 'zod';

export const playlistIdParamSchema = z.object({
  id: z.uuid(),
});

export const playlistAndTrackParamSchema = z.object({
  id: z.uuid(),
  trackId: z.uuid(),
});

export const createPlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  isPublic: z.boolean().default(false),
  thumbnailUrl: z.url().max(1000).nullable().optional(),
});

export const updatePlaylistSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isPublic: z.boolean().optional(),
  thumbnailUrl: z.url().max(1000).nullable().optional(),
  trackOrder: z.array(z.uuid()).optional(),
});

export const addTracksSchema = z.object({
  trackIds: z.array(z.uuid()).nonempty(),
});

export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type AddTracksInput = z.infer<typeof addTracksSchema>;

export const playlistSearchQuerySchema = z.object({
  search: z.string().max(100).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).default(10),
});

export const playlistUserParamsSchema = z.object({
  userId: z.string(),
});

export const playlistUserQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).default(10),
});

export type PlaylistSearchQuery = z.infer<typeof playlistSearchQuerySchema>;
export type PlaylistUserParams = z.infer<typeof playlistUserParamsSchema>;
export type PlaylistUserQuery = z.infer<typeof playlistUserQuerySchema>;
