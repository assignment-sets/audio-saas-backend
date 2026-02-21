// src/queues/types.ts ~annotator~
export enum JobName {
  USER_CLEANUP = 'user-cleanup',
  // more can be added later: SEND_WELCOME_EMAIL = "send-welcome-email"
}

export interface UserCleanupPayload {
  userId: string;
}

// Map Job Names to their specific Payloads
export interface JobDataMap {
  [JobName.USER_CLEANUP]: UserCleanupPayload;
}
