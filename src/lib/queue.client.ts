// src/lib/queue.client.ts
import { Queue } from 'bullmq';
import { env } from '../config/env_setup/env';
import { JobName } from '../queues/types';
import type { JobDataMap } from '../queues/types';
import { QueueNames } from '../config/constants/constants';

// Central Redis connection configuration
const connection = {
  host: env.REDIS_HOST || 'localhost',
  port: env.REDIS_PORT || 6379,
};

// Standard background job configuration
const defaultAppJobOptions = {
  attempts: 3, // Retry 3 times if it fails
  backoff: {
    type: 'exponential' as const,
    delay: 1000, // Wait 1s, then 2s, then 4s...
  },
  removeOnComplete: true, // Clean up Redis storage immediately after success
};

// 1. Instantiate the Dedicated Queues
export const userQueue = new Queue(QueueNames.USER, {
  connection,
  defaultJobOptions: defaultAppJobOptions,
});

export const artistQueue = new Queue(QueueNames.ARTIST, {
  connection,
  defaultJobOptions: defaultAppJobOptions,
});

export const trackQueue = new Queue(QueueNames.TRACK, {
  connection,
  defaultJobOptions: defaultAppJobOptions,
});

// TRANSCODE QUEUE (For Dockerized FFmpeg - keeps failed jobs for debugging)
export const transcodeQueue = new Queue(QueueNames.TRANSCODE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000, // Longer delay between retries because processing audio is heavy
    },
    removeOnComplete: true,
    removeOnFail: false, // CRITICAL: Keeps failed jobs visible in Redis so you can see why FFmpeg broke
  },
});

// 2. Type-Safe Helper Functions for Your Services

/**
 * Pushes general platform tasks (like user soft-delete/cleanup) to the User Queue
 */
export const addUserJob = async (
  name: typeof JobName.USER_CLEANUP,
  data: JobDataMap[typeof JobName.USER_CLEANUP],
) => {
  return await userQueue.add(name, data);
};

/**
 * Pushes outbox events originating from the Artist module to the Artist Queue
 */
export const addArtistJob = async (
  name: typeof JobName.PROCESS_OUTBOX,
  data: JobDataMap[typeof JobName.PROCESS_OUTBOX],
) => {
  return await artistQueue.add(name, data);
};

/**
 * Pushes outbox events originating from the Track module to the Track Queue
 */
export const addTrackJob = async (
  name: typeof JobName.PROCESS_OUTBOX,
  data: JobDataMap[typeof JobName.PROCESS_OUTBOX],
) => {
  return await trackQueue.add(name, data);
};

/**
 * Pushes processing payloads to the dedicated audio Transcoding Queue
 */
export const addTranscodeJob = async (
  name: typeof JobName.TRANSCODE_TRACK,
  data: JobDataMap[typeof JobName.TRANSCODE_TRACK],
) => {
  return await transcodeQueue.add(name, data);
};
