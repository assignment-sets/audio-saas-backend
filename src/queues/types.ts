// src/queues/types.ts ~annotator~
export enum JobName {
  USER_CLEANUP = 'user-cleanup',
  PROCESS_OUTBOX = 'process-outbox',
  TRANSCODE_TRACK = 'transcode-track',
}

export interface UserCleanupPayload {
  userId: string;
}

export interface OutboxPayload {
  outboxId: string;
}

export interface TranscodePayload {
  trackId: string;
  rawAudioUrl: string;
}

export interface JobDataMap {
  [JobName.USER_CLEANUP]: UserCleanupPayload;
  [JobName.PROCESS_OUTBOX]: OutboxPayload;
  [JobName.TRANSCODE_TRACK]: TranscodePayload;
}
