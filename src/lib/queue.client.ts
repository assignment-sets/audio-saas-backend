// src/lib/queue.client.ts ~annotator~
import { Queue } from 'bullmq';
import { env } from '../config/env_setup/env';
import { JobName } from '../queues/types';
import type { JobDataMap } from '../queues/types';
import { QueueNames } from '../config/constants/constants';

// Redis connection options
const connection = {
  host: env.REDIS_HOST || 'localhost',
  port: env.REDIS_PORT || 6379,
};

// Create the main background queue
// We use JobDataMap[JobName] to ensure type safety when adding jobs
export const mainQueue = new Queue(QueueNames.MAIN, {
  connection,
  defaultJobOptions: {
    attempts: 3, // Retry 3 times if it fails
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true, // Clean up Redis after success
  },
});

/**
 * Type-safe helper to push jobs to the queue
 */
export const addJob = async <T extends JobName>(
  name: T,
  data: JobDataMap[T],
) => {
  return await mainQueue.add(name, data);
};
