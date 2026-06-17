import { prisma } from '../../lib/prisma';
import type { CreateTrackInput, UpdateTrackInput } from './track.schema';
import { NotFoundError, ForbiddenError } from '../../lib/errors';
import { fgaClient } from '../../lib/fga.client';
import { OutboxStatus, Prisma, type Track } from '@prisma/client';
import { OutboxIntentTypes } from '../../config/constants/constants';
import { addTrackJob } from '../../lib/queue.client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { JobName } from '../../queues/types';
import { logger } from '../../config/logging_setup/logger';
import { s3Client, BUCKET_NAME } from '../../lib/s3.client';
import { engagementRedis } from '../../lib/engagementRedis.client';

export const getTracksByArtist = async (artistId: string): Promise<Track[]> => {
  return await prisma.track.findMany({
    where: {
      artistId,
      state: 'ready', // Don't leak processing or failed tracks
    },
    orderBy: { createdAt: 'desc' },
  });
};

type TrackWithRelations = Track & {
  artist: { id: string; artistName: string };
  album: { id: string; title: string } | null;
};

export const getTrackById = async (
  userId: string,
  id: string,
): Promise<TrackWithRelations> => {
  // FGA Check: Only those who can edit/manage the track can view its internal details
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_edit',
    object: `track:${id}`,
  });

  if (!allowed)
    throw new ForbiddenError('Not authorized to view internal track details');

  const track = await prisma.track.findUnique({
    where: { id },
    include: {
      artist: { select: { artistName: true, id: true } },
      album: { select: { title: true, id: true } },
    },
  });

  if (!track || track.state === 'deleted')
    throw new NotFoundError('Track not found');
  return track;
};

export const createTrack = async (
  userId: string,
  data: CreateTrackInput,
): Promise<Track> => {
  // 1. FGA Check
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_manage',
    object: `artist_profile:${data.artistId}`,
  });

  if (!allowed)
    throw new ForbiddenError('Not authorized to add tracks for this artist');

  // 2. Transaction: State & Outbox Persistence
  const { track, outboxTask } = await prisma.$transaction(async (tx) => {
    const newTrack = await tx.track.create({
      data: {
        artistId: data.artistId,
        albumId: data.albumId,
        title: data.title,
        trackNumber: data.trackNumber,
        durationSeconds: data.durationSeconds,
        audioUrl: data.audioUrl,
        state: 'processing',
      },
    });

    const task = await tx.outbox.create({
      data: {
        type: OutboxIntentTypes.CREATE_TRACK,
        payload: { trackId: newTrack.id, artistId: data.artistId },
        status: OutboxStatus.PENDING,
      },
    });

    return { track: newTrack, outboxTask: task };
  });

  try {
    await addTrackJob(JobName.PROCESS_OUTBOX, { outboxId: outboxTask.id });
  } catch (queueError: unknown) {
    // We don't throw here because the DB is already updated.
    // The reconciliation/sweeper will pick up the PENDING outbox row later.
    const msg =
      queueError instanceof Error ? queueError.message : String(queueError);
    logger.error(
      { err: msg, trackId: track.id, outboxId: outboxTask.id },
      'Failed to push to transcode queue. Outbox will handle fallback.',
    );
  }

  return track;
};

export const processTranscodeWebhook = async (
  trackId: string,
  outboxId: string,
  status: 'success' | 'failed',
  audioUrl?: string, // 👈 Captured parameter
  error?: string,
): Promise<void> => {
  if (status === 'success') {
    if (!audioUrl)
      throw new Error(
        'Missing audioUrl payload from successful transcode event',
      );

    await prisma.$transaction([
      // 1. Swap raw upload path with the absolute streaming HLS master playlist URL
      prisma.track.update({
        where: { id: trackId },
        data: {
          state: 'ready',
          audioUrl: audioUrl, // 👈 Saves streaming source to db
        },
      }),
      // 2. Clear out the transactional outbox task
      prisma.outbox.update({
        where: { id: outboxId },
        data: { status: OutboxStatus.COMPLETED },
      }),
    ]);
  } else {
    await prisma.$transaction([
      // 1. Move the track status to failed so UI can notify the artist
      prisma.track.update({
        where: { id: trackId },
        data: { state: 'failed' },
      }),
      // 2. Mark the outbox record as failed along with its trace logs
      prisma.outbox.update({
        where: { id: outboxId },
        data: {
          status: OutboxStatus.FAILED,
          lastError: error || 'Unknown transcode error',
        },
      }),
    ]);
  }
};

export const updateTrack = async (
  userId: string,
  trackId: string,
  data: UpdateTrackInput,
): Promise<Track> => {
  // 1. User must be able to edit the specific track
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_edit',
    object: `track:${trackId}`,
  });

  if (!allowed) throw new ForbiddenError('Not authorized to edit this track');

  return await prisma.track.update({
    where: { id: trackId },
    data,
  });
};

export const deleteTrack = async (
  userId: string,
  trackId: string,
): Promise<void> => {
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_delete',
    object: `track:${trackId}`,
  });

  if (!allowed) throw new ForbiddenError('Not authorized to delete this track');

  // 1. Transaction: Create Outbox Intent & Update State
  const { outboxTask } = await prisma.$transaction(async (tx) => {
    // Hide it from UI immediately
    await tx.track.update({
      where: { id: trackId },
      data: { state: 'deleted' },
    });

    const task = await tx.outbox.create({
      data: {
        type: OutboxIntentTypes.DELETE_TRACK,
        payload: { trackId },
        status: OutboxStatus.PENDING,
      },
    });

    return { outboxTask: task };
  });

  // 2. TELL BULLMQ TO WAKE UP THE WORKER
  try {
    await addTrackJob(JobName.PROCESS_OUTBOX, { outboxId: outboxTask.id });
  } catch (error: unknown) {
    logger.error(
      { err: error, trackId, outboxId: outboxTask.id },
      'Failed to queue delete job immediately, outbox will catch it later',
    );
  }
};

// ==========================================
// LISTENER ACTIONS (High Volume)
// ==========================================

export const recordPlay = async (
  userId: string,
  trackId: string,
  durationPlayedSeconds: string | number,
): Promise<void> => {
  const payload = JSON.stringify({
    userId,
    trackId,
    durationPlayedSeconds: Number(durationPlayedSeconds),
    playedAt: new Date().toISOString(),
  });

  await engagementRedis.rpush('engagement:track-plays', payload);
};

export const likeTrack = async (
  userId: string,
  trackId: string,
): Promise<void> => {
  // Same warning as recordPlay. Batching is safer at scale.
  // Using upsert ensures idempotency (clicking like twice doesn't crash).
  await prisma.trackLike.upsert({
    where: {
      userId_trackId: { userId, trackId },
    },
    update: {}, // Do nothing if it exists
    create: {
      userId,
      trackId,
    },
  });
};

export const unlikeTrack = async (
  userId: string,
  trackId: string,
): Promise<void> => {
  try {
    await prisma.trackLike.delete({
      where: {
        userId_trackId: { userId, trackId },
      },
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return; // Ignore if it doesn't exist
    }
    throw error;
  }
};

export const generateAudioUploadUrl = async (
  userId: string,
  artistId: string,
  fileName: string,
  contentType: string,
  fileSize: number, // Checked via Zod, passed here for potential future use/logging
): Promise<{ url: string; key: string }> => {
  // 1. FGA Check: Can this user edit/manage this artist?
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_manage',
    object: `artist_profile:${artistId}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to upload audio for this artist');
  }

  // 2. Key Generation: Never trust user filenames. Extract extension and generate a UUID.
  const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'bin';
  // Use crypto.randomUUID() natively available in Node
  const key = `raw-tracks/${artistId}/${crypto.randomUUID()}.${fileExtension}`;

  // 3. S3 Command Preparation
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    // Optional: add metadata to track who uploaded it
    Metadata: {
      userId,
      originalFileName: fileName,
    },
  });

  // 4. Generate the URL (Expires in 5 minutes)
  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    return { url, key };
  } catch (error: unknown) {
    // Log internally, keep the user-facing error clean
    console.error('S3 Presign Error:', error);
    throw new Error('Failed to generate upload URL');
  }
};

export const processBatchPlays = async (
  plays: {
    userId?: string | null;
    trackId: string;
    durationPlayedSeconds: number;
    playedAt?: string;
  }[],
): Promise<void> => {
  if (plays.length === 0) return;

  const uniqueTrackIds = Array.from(new Set(plays.map((p) => p.trackId)));
  const uniqueUserIds = Array.from(
    new Set(plays.map((p) => p.userId).filter((id): id is string => !!id)),
  );

  // Parallel lookup of existing tracks and users to satisfy foreign key constraints
  const [existingTracks, existingUsers] = await Promise.all([
    prisma.track.findMany({
      where: { id: { in: uniqueTrackIds } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true },
    }),
  ]);

  const existingTrackIdsSet = new Set(existingTracks.map((t) => t.id));
  const existingUserIdsSet = new Set(existingUsers.map((u) => u.id));

  // Filter out plays for deleted tracks, and anonymize plays for deleted users
  const sanitizedPlays = plays
    .filter((play) => existingTrackIdsSet.has(play.trackId))
    .map((play) => ({
      userId:
        play.userId && existingUserIdsSet.has(play.userId) ? play.userId : null,
      trackId: play.trackId,
      durationPlayedSeconds: play.durationPlayedSeconds,
      playedAt: play.playedAt ? new Date(play.playedAt) : new Date(),
    }));

  if (sanitizedPlays.length === 0) {
    logger.info('All plays in batch were skipped due to deleted tracks.');
    return;
  }

  await prisma.trackPlay.createMany({
    data: sanitizedPlays,
  });
};
