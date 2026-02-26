// src/queues/types.ts ~annotator~
export enum JobName {
  USER_CLEANUP = 'user-cleanup',
  PROCESS_OUTBOX = 'process-outbox',
}

export interface UserCleanupPayload {
  userId: string;
}

export interface OutboxPayload {
  outboxId: string;
}

export interface JobDataMap {
  [JobName.USER_CLEANUP]: UserCleanupPayload;
  [JobName.PROCESS_OUTBOX]: OutboxPayload;
}
