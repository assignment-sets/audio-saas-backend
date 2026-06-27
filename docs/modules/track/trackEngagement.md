# Track Engagement Counters & Buffer Pipeline

This document details database-level counter triggers and the high-throughput asynchronous play count buffer pipeline.

---

## 1. Database-Level Counters (Triggers)

To support $O(1)$ reads for track engagement without executing expensive aggregates or joins, counts are cached directly on the `tracks` table via database triggers:

```mermaid
flowchart TD
    subgraph Track Likes [Track Likes Table]
        LikeInsert[Insert Like] --> LikeTrigger[track_likes_count_trigger]
        LikeDelete[Delete Like] --> LikeTrigger
    end

    subgraph Track Plays [Track Plays Table]
        PlayInsert[Insert Play] --> PlayTrigger[track_plays_count_trigger]
        PlayDelete[Delete Play] --> PlayTrigger
    end

    LikeTrigger -->|Increment/Decrement| TracksDB[("Tracks Table: play_count / like_count")]
    PlayTrigger -->|Increment/Decrement| TracksDB
```

- `track_likes_count_trigger`: Updates `like_count` on `tracks` `AFTER INSERT OR DELETE` on `track_likes`.
- `track_plays_count_trigger`: Updates `play_count` on `tracks` `AFTER INSERT OR DELETE` on `track_plays`.

---

## 2. High-Throughput Plays Buffer Pipeline

To avoid database bottlenecks under high-volume streaming, plays are buffered in an asynchronous Redis pipeline:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Listener Client
    participant API as SaaS Backend API
    participant Redis as Redis (engagement-redis:6380)
    participant BGService as Engagement Background Service
    participant DB as PostgreSQL Database

    Client->>API: POST /api/track/:id/play { durationPlayedSeconds }
    Note over API: Hydrate req.user context (if authenticated)
    API->>Redis: RPUSH "engagement:track-plays" (event JSON)
    API-->>Client: 202 Accepted (Instant Response)

    %% Background job
    Note over BGService: Triggered periodically (INTERVAL_MS)
    BGService->>Redis: LRANGE "engagement:track-plays" 0 (BATCH_SIZE-1)
    Redis-->>BGService: Returns play events batch
    BGService->>API: POST /api/track/webhook/batch-plays { plays } (Headers: x-webhook-secret)

    %% Processing batch
    Note over API: Authenticates secret
    Note over API: Checks track & user existences in DB (anonymizes deleted users, drops deleted tracks)
    API->>DB: createMany() (Bulk Insert sanitized plays)
    API-->>BGService: 200 OK
    BGService->>Redis: LTRIM "engagement:track-plays" (batch_length) -1 (Purges head items)
```

### Detailed Pipeline Breakdown

1.  **Ingestion (`POST /api/track/:id/play`)**: Validates input duration. Serializes the event (`userId` or `null`, `trackId`, `durationPlayedSeconds`, `playedAt`) and pushes it via `RPUSH` to the `engagement:track-plays` list in Redis. Instantly returns a `202 Accepted`.
2.  **Aggregation (`engagement-bg-svc`)**: A dedicated Node.js service polls Redis periodically, pulling batches using `LRANGE` and posting them to our internal webhook.
3.  **Sanitization & Batch Write (`POST /api/track/webhook/batch-plays`)**:
    - **Orphan Validation**: Cross-checks track and user IDs in the batch.
    - **Cascade Safe**: If a user was deleted, the `userId` field is set to `null` to register the play anonymously (preventing foreign key constraints failures). If a track no longer exists, it is discarded.
    - **Bulk SQL Write**: Inserts the remaining sanitized records inside a single `createMany` transaction block.
4.  **trimming (`LTRIM`)**: Upon receiving `200 OK`, the background service trims the head of the Redis list. If it fails, logs are not trimmed and will be retried.
