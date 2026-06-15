// src/queues/workers/track.worker.ts
import { Worker, Job } from 'bullmq';
import { JobName, type OutboxPayload } from '../../queues/types';
import { prisma } from '../../lib/prisma';
import { fgaClient } from '../../lib/fga.client';
import { env } from '../../config/env_setup/env';
import { logger } from '../../config/logging_setup/logger';
import {
  QueueNames,
  OutboxIntentTypes,
} from '../../config/constants/constants';
import { OutboxStatus } from '@prisma/client';
import { addTranscodeJob } from '../../lib/queue.client';
import { s3Client, BUCKET_NAME } from '../../lib/s3.client';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const connection = { host: env.REDIS_HOST, port: env.REDIS_PORT };

const SUPPORTED_INTENTS = [
  OutboxIntentTypes.CREATE_TRACK,
  OutboxIntentTypes.DELETE_TRACK,
];

export const initTrackWorker = () => {
  return new Worker<OutboxPayload>(
    QueueNames.TRACK,
    async (job: Job<OutboxPayload>) => {
      if (job.name !== JobName.PROCESS_OUTBOX) return;

      const { outboxId } = job.data;

      // Lock the task
      const task = await prisma.outbox.findUnique({ where: { id: outboxId } });

      if (!task || task.status === OutboxStatus.COMPLETED) return;
      if (!SUPPORTED_INTENTS.includes(task.type as OutboxIntentTypes)) return;

      await prisma.outbox.update({
        where: { id: outboxId },
        data: { status: OutboxStatus.PROCESSING, attempts: { increment: 1 } },
      });

      try {
        // ==========================================
        // INTENT: CREATE TRACK
        // ==========================================
        if (task.type === OutboxIntentTypes.CREATE_TRACK) {
          const { trackId, artistId } = task.payload as {
            trackId: string;
            artistId: string;
          };

          const track = await prisma.track.findFirst({
            where: { id: trackId, state: 'processing' },
          });

          if (!track) throw new Error('Track not found or invalid state');

          // 1. Write FGA Tuples
          await fgaClient.write({
            writes: [
              {
                user: `artist_profile:${artistId}`,
                relation: 'parent_artist',
                object: `track:${trackId}`,
              },
            ],
          });

          // 2. Pass to external transcoder
          await addTranscodeJob(JobName.TRANSCODE_TRACK, {
            trackId: track.id,
            rawAudioUrl: track.audioUrl,
            outboxId: task.id,
          });

          logger.info({ trackId }, 'FGA created, sent to external transcoder');
          // Note: Do NOT mark as completed here. Webhook does that.
        }

        // ==========================================
        // INTENT: DELETE TRACK
        // ==========================================
        if (task.type === OutboxIntentTypes.DELETE_TRACK) {
          const { trackId } = task.payload as { trackId: string };

          const track = await prisma.track.findUnique({
            where: { id: trackId },
          });

          if (track) {
            // 1. Delete FGA Tuples (if they exist)
            try {
              await fgaClient.write({
                deletes: [
                  {
                    user: `artist_profile:${track.artistId}`,
                    relation: 'parent_artist',
                    object: `track:${trackId}`,
                  },
                ],
              });
            } catch (fgaErr) {
              logger.warn(
                { trackId },
                'FGA tuple already gone or failed to delete',
              );
            }

            // 2. Purge S3 Files (HLS folder)
            const prefix = `processed-tracks/${trackId}/`;
            const listedObjects = await s3Client.send(
              new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix }),
            );

            if (listedObjects.Contents && listedObjects.Contents.length > 0) {
              const deleteParams = {
                Bucket: BUCKET_NAME,
                Delete: {
                  Objects: listedObjects.Contents.map((item) => ({
                    Key: item.Key,
                  })),
                },
              };
              await s3Client.send(new DeleteObjectsCommand(deleteParams));
            }

            // 3. Hard Delete Database Record (Cascades to track_likes and track_plays)
            await prisma.track.delete({
              where: { id: trackId },
            });
          }

          // 4. Mark Outbox as Completed
          await prisma.outbox.update({
            where: { id: outboxId },
            data: { status: OutboxStatus.COMPLETED },
          });

          logger.info(
            { trackId },
            'Track hard-deleted and cleaned up completely',
          );
        }
      } catch (error: any) {
        // Rollback / Error handling
        await prisma.outbox.update({
          where: { id: outboxId },
          data: {
            status: OutboxStatus.FAILED,
            lastError: error.message,
          },
        });
        throw error; // Let BullMQ handle backoff/retries
      }
    },
    { connection, concurrency: 5 },
  );
};
