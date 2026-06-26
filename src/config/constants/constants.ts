// Queue Names
export enum QueueNames {
  USER = 'user-queue',
  ARTIST = 'artist-queue',
  TRACK = 'track-queue',
  TRANSCODE = 'transcode-queue',
}

// Outbox Intent Types
export enum OutboxIntentTypes {
  CREATE_ARTIST_PROFILE = 'CREATE_ARTIST_PROFILE',
  CREATE_TRACK = 'CREATE_TRACK',
  DELETE_TRACK = 'DELETE_TRACK',
  APPOINT_ARTIST_MANAGER = 'APPOINT_ARTIST_MANAGER',
  REVOKE_ARTIST_MANAGER = 'REVOKE_ARTIST_MANAGER',
  // SEND_WELCOME_EMAIL = 'SEND_WELCOME_EMAIL',
  // SYNC_STRIPE_CUSTOMER = 'SYNC_STRIPE_CUSTOMER',
}

// FGA Specific Constants
export enum FgaPlatformNames {
  MAIN_APP = 'mainApp',
  // Add more platform refs as needed
}
