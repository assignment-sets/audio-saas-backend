# Audio SaaS Backend System Documentation

This directory contains the architectural, data flow, and API schema documentation for all backend modules.

---

## 1. Module Index

### 🔐 Authentication & Authorization

- [Authentication & Authorization Middleware](modules/auth/authMiddleware.md) — JWT checking, Postgres hydration, and `optionalAuth` guest fallback.

### 👤 Users

- [User Profile Lifecycle](modules/user/userLifecycle.md) — Auth0 synchronization, profile updates, and async hard deletes via background queues.

### 🎤 Artists

- [Artist Profile Lifecycle](modules/artist/artistLifecycle.md) — Onboarding slugs validation, outbox workers, and compensating Sagas.
- [Artist Social & Followers](modules/artist/artistRetrieval.md) — Follow/unfollow mechanics and cursor-based paginated followers list.
- [Manager Delegation](modules/artist/managerDelegation.md) — FGA appointment syncs and rollback Sagas.

### 🎵 Tracks

- [Track Lifecycle & Pipelines](modules/track/trackLifecycle.md) — Presigned S3 uploads, transcoding hooks, and hard deletion teardowns.
- [Track Engagement Counters](modules/track/trackEngagement.md) — Likes/plays trigger counters and Redis play event logging buffer.
- [Track Retrieval & Listings](modules/track/trackRetrieval.md) — Unified artist track lists and cursor-based pagination.

### 💿 Albums

- [Album Lifecycle & Guardrails](modules/album/albumLifecycle.md) — Status flow rules (DRAFT vs PUBLISHED) and publishing limits.
- [Album Tracklist updates](modules/album/albumTracklist.md) — Transactional additions, removals, and Dense Index reordering.
- [Album Retrieval & Views](modules/album/albumRetrieval.md) — Consolidated GET listing showing draft visibility based on FGA credentials.

### 📋 Playlists

- [Playlist Lifecycle & Policies](modules/playlist/playlistLifecycle.md) — CRUD operations, maximum playlist caps, and private/public FGA visibility.
- [Playlist Tracklist Management](modules/playlist/playlistTracklist.md) — Capacity bounds and optimized SQL bulk `CASE` re-sequencing.
- [Playlist Retrieval & Searches](modules/playlist/playlistRetrieval.md) — Retrieve by ID (with dynamic like hydration) and paginated searches/listings.
