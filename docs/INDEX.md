# Audio SaaS Backend System Documentation Index

This index provides a complete sitemap of all architectural, data flow, API schema, and infrastructure documentation for the Audio SaaS Backend system.

---

## 🔐 Authentication & Authorization

- [Authentication & Authorization Middleware](modules/auth/authMiddleware.md) — JWT checking, Postgres hydration, Auth0 integration, and `optionalAuth` guest fallback.
- [Auth0 Tenant Actions & Sync Scripts](../auth0/README.md) — Post-registration async sync, post-login custom claims injection, and synchronous DB sync guardrail.

## 👤 Users

- [User Profile Lifecycle](modules/user/userLifecycle.md) — Auth0 synchronization, profile updates, and async hard deletes via background queues.

## 🎤 Artists

- [Artist Profile Lifecycle](modules/artist/artistLifecycle.md) — Onboarding slugs validation, outbox workers, and compensating Sagas.
- [Artist Social & Followers](modules/artist/artistRetrieval.md) — Follow/unfollow mechanics and cursor-based paginated followers list.
- [Manager Delegation](modules/artist/managerDelegation.md) — FGA appointment syncs and rollback Sagas.

## 🎵 Tracks

- [Track Lifecycle & Pipelines](modules/track/trackLifecycle.md) — Presigned S3 uploads, transcoding hooks, and hard deletion teardowns.
- [Track Engagement Counters](modules/track/trackEngagement.md) — Likes/plays trigger counters and Redis play event logging buffer.
- [Track Retrieval & Listings](modules/track/trackRetrieval.md) — Unified artist track lists and cursor-based pagination.

## 💿 Albums

- [Album Lifecycle & Guardrails](modules/album/albumLifecycle.md) — Status flow rules (DRAFT vs PUBLISHED) and publishing limits.
- [Album Tracklist Updates](modules/album/albumTracklist.md) — Transactional additions, removals, and Dense Index reordering.
- [Album Retrieval & Views](modules/album/albumRetrieval.md) — Consolidated GET listing showing draft visibility based on FGA credentials.

## 📋 Playlists

- [Playlist Lifecycle & Policies](modules/playlist/playlistLifecycle.md) — CRUD operations, maximum playlist caps, and private/public FGA visibility.
- [Playlist Tracklist Management](modules/playlist/playlistTracklist.md) — Capacity bounds and optimized SQL bulk `CASE` re-sequencing.
- [Playlist Retrieval & Searches](modules/playlist/playlistRetrieval.md) — Retrieve by ID (with dynamic like hydration) and paginated searches/listings.

## 💳 Payment & Subscriptions

- [Payment & Subscription Systems](modules/payment/paymentSubscription.md) — Stripe checkout sessions, webhooks, setup intents, and metered billing API.
- [Subscription Limits & Tier Matrix](modules/payment/subscriptionLimits.md) — Tier matrices (`FREE`, `LITE`, `PRO`) and tier enforcement middleware.

## 🔍 Search

- [Search & Retrieval](modules/search/searchRetrieval.md) — Multi-entity trigram index search across tracks, albums, playlists, and artists.

## ⚡ Infrastructure & Cross-Cutting Systems

- [API Rate Limiting](infrastructure/rateLimiting.md) — Redis sorted sets sliding-window limiting for API abuse prevention.
- [Metadata Caching](infrastructure/metadataCaching.md) — Service-level cache structures with dynamic personalization injection.
