import { z } from 'zod';

export const trackIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const artistIdParamSchema = z.object({
  artistId: z.string().uuid(),
});

// Used when creating a track. Requires artistId to know where it belongs.
export const createTrackSchema = z.object({
  artistId: z.string().uuid(),
  albumId: z.string().uuid().optional(),
  title: z.string().min(1).max(100),
  trackNumber: z.number().int().positive().optional(),
  durationSeconds: z.number().int().positive(),
  audioUrl: z.string(),
});

// Only allow updating non-critical metadata. Audio URL changes should probably be a new track or require strict re-processing.
export const updateTrackSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  trackNumber: z.number().int().positive().optional(),
  albumId: z.string().uuid().optional().nullable(),
});

export const trackPlaySchema = z.object({
  durationPlayedSeconds: z.number().int().nonnegative(),
});

export const generateUploadUrlSchema = z.object({
  artistId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.enum(
    ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg', 'audio/mp4'],
    {
      message: 'Invalid content type. Must be a supported audio format.',
    },
  ),
  // Max 100MB (100 * 1024 * 1024)
  fileSize: z
    .number()
    .int()
    .positive()
    .max(104857600, 'File size exceeds 100MB limit'),
});

export const transcodeWebhookSchema = z.object({
  trackId: z.string().uuid(),
  outboxId: z.string().uuid(),
  status: z.enum(['success', 'failed']),
  audioUrl: z.string().url().optional(), // 👈 Accepts the HLS playlist URL
  error: z.string().optional(),
});

export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type UpdateTrackInput = z.infer<typeof updateTrackSchema>;
export type TrackPlayInput = z.infer<typeof trackPlaySchema>;
export type GenerateUploadUrlInput = z.infer<typeof generateUploadUrlSchema>;
export type TranscodeWebhookInput = z.infer<typeof transcodeWebhookSchema>;
