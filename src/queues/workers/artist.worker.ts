import { Worker, Job } from 'bullmq';
import { JobName, type OutboxPayload } from '../types';
import { prisma } from '../../lib/prisma';
import { fgaClient } from '../../lib/fga.client';
import { env } from '../../config/env_setup/env';
import { logger } from '../../config/logging_setup/logger';
import { QueueNames } from '../../config/constants/constants';
import { OutboxIntentTypes } from '../../config/constants/constants';
import { FgaPlatformNames } from '../../config/constants/constants';

// Prisma enum import
import { OutboxStatus } from '@prisma/client';

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};

// Define what this specific worker is allowed to process
const SUPPORTED_INTENTS = [OutboxIntentTypes.CREATE_ARTIST_PROFILE];

export const initOutboxWorker = () => {
  const worker = new Worker<OutboxPayload>(
    QueueNames.MAIN,
    async (job: Job<OutboxPayload>) => {
      // 1. Guard against wrong job queue types
      if (job.name !== JobName.PROCESS_OUTBOX) return;

      const { outboxId } = job.data;

      // 2. Fetch the "Ticket" from Postgres
      const task = await prisma.outbox.findUnique({
        where: { id: outboxId },
      });

      // 3. Guard: Does it exist? Is it already done?
      if (!task || task.status === OutboxStatus.COMPLETED) {
        return;
      }

      // 4. Guard: Can THIS worker handle this intent? (Your crucial fix)
      if (!SUPPORTED_INTENTS.includes(task.type as OutboxIntentTypes)) {
        logger.warn(
          { outboxId, type: task.type },
          'Worker cannot handle this intent type. Skipping.',
        );
        return;
      }

      // 5. NOW we lock it into processing state
      await prisma.outbox.update({
        where: { id: outboxId },
        data: {
          status: OutboxStatus.PROCESSING,
          attempts: { increment: 1 },
        },
      });

      try {
        // 6. Execute the specific logic
        if (task.type === OutboxIntentTypes.CREATE_ARTIST_PROFILE) {
          // Payload is typed as unknown in Prisma Json, so we cast it safely
          const { userId, profileId } = task.payload as {
            userId: string;
            profileId: string;
          };

          await fgaClient.write({
            writes: [
              {
                user: `user:${userId}`,
                relation: 'owner',
                object: `artist_profile:${profileId}`,
              },
              {
                user: `platform:${FgaPlatformNames.MAIN_APP}`,
                relation: 'platform_ref',
                object: `artist_profile:${profileId}`,
              },
            ],
          });
        }

        // 7. Success - Mark as completed
        await prisma.outbox.update({
          where: { id: outboxId },
          data: { status: OutboxStatus.COMPLETED },
        });

        logger.info(
          { outboxId, type: task.type },
          'Outbox task completed successfully',
        );
      } catch (error: any) {
        // Check if BullMQ is out of retries (job.opts.attempts is max retries)
        const maxAttempts = job.opts.attempts || 3;
        const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;

        logger.error(
          { err: error.message, outboxId, attempt: job.attemptsMade + 1 },
          'Outbox task failed',
        );

        // 8. The Saga: Permanent Failure vs Temporary Failure
        if (isFinalAttempt) {
          await handlePermanentFailure(task);
        } else {
          // Just log the error and let BullMQ retry
          await prisma.outbox.update({
            where: { id: outboxId },
            data: {
              status: OutboxStatus.FAILED,
              lastError: error.message,
            },
          });
        }

        // Throw error to ensure BullMQ knows it failed and applies backoff/retries
        throw error;
      }
    },
    { connection, concurrency: 5 },
  );

  return worker;
};

/**
 * Cleanup logic if the job fails all retries (The Saga Compensating Transaction)
 */
async function handlePermanentFailure(task: any) {
  const { id: outboxId, type, payload } = task;

  try {
    if (type === OutboxIntentTypes.CREATE_ARTIST_PROFILE) {
      const { profileId } = payload as { profileId: string };

      // Delete the "Ghost" profile because permissions could not be established
      await prisma.artistProfile.delete({
        where: { id: profileId },
      });

      await prisma.outbox.update({
        where: { id: outboxId },
        data: {
          status: OutboxStatus.FAILED_AND_ROLLED_BACK,
          lastError: 'Max retries reached. Profile deleted.',
        },
      });

      logger.warn(
        { profileId },
        'SAGA: Deleted artist profile due to permanent FGA failure',
      );
    }
  } catch (rollbackError: any) {
    logger.error(
      { err: rollbackError.message, outboxId },
      'SAGA: Failed to rollback database record',
    );
  }
}
