// src/queues/workers/user.worker.ts ~annotator~
import { Worker, Job } from 'bullmq';
import { JobName } from '../types';
import type { UserCleanupPayload } from '../types';
import { prisma } from '../../lib/prisma';
import { management } from '../../lib/auth0.client';
import { fgaClient } from '../../lib/fga.client';
import { env } from '../../config/env_setup/env';
import { logger } from '../../config/logging_setup/logger';
import { QueueNames } from '../../config/constants/constants';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

/**
 * Worker logic to handle eventual consistency for user deletion.
 */
export const initUserWorker = () => {
  const worker = new Worker<UserCleanupPayload>(
    QueueNames.MAIN,
    async (job: Job<UserCleanupPayload>) => {
      const { userId } = job.data;

      if (job.name === JobName.USER_CLEANUP) {
        logger.info(
          { userId, jobId: job.id },
          'Worker: Starting cleanup process',
        );

        // 1. OpenFGA Cleanup
        try {
          const { tuples } = await fgaClient.read({ user: `user:${userId}` });

          // Ensure tuples is an array and has items before mapping
          if (tuples && tuples.length > 0) {
            await fgaClient.write({
              deletes: tuples.map((t) => ({
                user: t.key.user,
                relation: t.key.relation,
                object: t.key.object,
              })),
            });
            logger.info({ userId }, 'Worker: OpenFGA tuples purged');
          } else {
            logger.info({ userId }, 'Worker: No OpenFGA tuples found to purge');
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(
            { err: message, userId },
            'Worker: OpenFGA cleanup failed (Non-blocking)',
          );
        }

        // 2. Auth0 Permanent Deletion
        try {
          await management.users.delete(userId);
          logger.info({ userId }, 'Worker: Auth0 record deleted');
        } catch (error: unknown) {
          // Defensive check for Auth0 error structure
          if (error !== null && typeof error === 'object') {
            const err = error as Record<string, unknown>;
            const statusCode = err.statusCode || err.status;

            if (statusCode === 404) {
              logger.info(
                { userId },
                'Worker: Auth0 record already gone (404), skipping...',
              );
            } else {
              logger.error(
                { err: err.message || 'Unknown Auth0 error', userId },
                'Worker: Auth0 deletion failed - Retrying...',
              );
              throw error;
            }
          } else {
            // Fallback for weird error types
            logger.error({ userId }, 'Worker: Critical Auth0 error occurred');
            throw error;
          }
        }

        // 3. Database Hard Delete (Triggers Cascade)
        try {
          // Naturally idempotent: deleteMany doesn't throw if 0 records match
          const result = await prisma.user.deleteMany({
            where: { id: userId },
          });

          if (result.count > 0) {
            logger.info(
              { userId },
              'Worker: Database record and relations purged',
            );
          } else {
            logger.info(
              { userId },
              'Worker: Database record already purged, skipping...',
            );
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(
            { err: message, userId },
            'Worker: DB hard delete failed - Retrying...',
          );
          throw error;
        }
      }
    },
    {
      connection,
      concurrency: 5, // Process up to 5 deletions in parallel
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Worker: Job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message, userId: job?.data.userId },
      'Worker: Job failed permanently',
    );
  });

  return worker;
};
