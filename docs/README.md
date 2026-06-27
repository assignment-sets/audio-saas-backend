# Audio SaaS Backend System Documentation

This folder contains the architectural and flow documentation for the backend system modules.

---

## Module Index

### 🔐 Authentication & Authorization

- [Soft-Auth & Route Consolidation](modules/auth/optionalAuth.md) — Dynamic token verification, guest fallback, and `isLiked` personalization logic.

### 💿 Albums

- [Album Lifecycle & Tracklist](modules/album/albumLifecycle.md) — Draft/Published state constraints, OpenFGA relation mappings, surgical track list patching.

### 🎵 Tracks

- [Track Engagement & Triggers](modules/track/engagementReadsAndTriggers.md) — Play and like counter triggers, soft-auth unified retrieval sequence.
- [Record Track Play](modules/track/recordTrackPlay.md) — Logging play streams, processing batch plays, and queue worker triggers.
- [Create Track](modules/track/createTrack.md) — Presigned S3 upload URLs, state transitions, transcoding flows.
- [Delete Track](modules/track/deleteTrack.md) — File purging, DB cleanup, FGA tuple teardown.

### 🎤 Artists

- [Create Artist Profile](modules/artist/createArtist.md) — Initial onboarding, slug reservation, FGA setup.
- [Manager Delegation](modules/artist/managerDelegation.md) — Relational DB tracking, limit enforcement, and asynchronous OpenFGA outbox synchronization.

### 👤 Users

- [Create User (Sync)](modules/user/createUser.md) — Auth0 post-registration webhook synchronization.
- [Update User](modules/user/updateUser.md) — Basic profile fields updates, metadata schema.
- [Delete User](modules/user/deleteUser.md) — Account deactivation, data scrubbing, cascade details.

### 📋 Playlists

- [Playlist Lifecycle & Tracklist](modules/playlist/playlistLifecycle.md) — Capacity caps, gapless reordering mechanics, and OpenFGA visibility logic.
