# Track Lifecycle & Pipeline Management

This document details the track lifecycle: from generating S3 pre-signed upload URLs and background transcoding pipeline stages, to updates and cascading deletion.

---

## 1. Track Upload & Transcoding Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Client as Creator Client
    participant API as SaaS Backend API
    participant Queue as BullMQ (track-queue)
    participant Worker as Background Worker
    participant DB as PostgreSQL Database
    participant S3 as AWS S3 Bucket
    participant FFMPEG as FFMPEG Transcoder Container

    Client->>API: POST /api/track/upload-url { fileName, contentType, fileSize }
    Note over API: Checks OpenFGA can_edit on artist_profile
    API->>S3: Request Pre-signed PUT URL (short-lived)
    S3-->>API: Pre-signed upload URL
    API-->>Client: Return URL & S3 object key (processing state)

    Client->>S3: Upload raw audio file directly (PUT)
    S3-->>Client: Upload complete (200 OK)

    Client->>API: POST /api/track { artistId, albumId, title, durationSeconds, audioUrl }
    Note over API: Checks FGA can_manage on artist_profile
    API->>DB: Create Track record (state: "processing") and Outbox entry
    API->>Queue: Push Outbox task (CREATE_TRACK)
    API-->>Client: 201 Created

    %% Background Transcode Trigger
    Worker->>DB: Set Outbox to PROCESSING
    Worker->>FGA: Write OpenFGA Tuple (track parent_artist)
    Worker->>FFMPEG: Dispatch TRANSCODE_TRACK job (with file details)

    %% Transcoder
    FFMPEG->>S3: Download raw audio key
    Note over FFMPEG: Transcodes raw audio to HLS (.m3u8 playlist + .ts chunks)
    FFMPEG->>S3: Upload processed HLS directory
    FFMPEG->>API: POST /api/track/webhook/transcode { trackId, outboxId, status: "success", audioUrl }

    %% Finalize
    API->>DB: Update Track record (state: "ready") and Outbox record (status: COMPLETED)
```

---

## 2. Track Deletion & Asset Purging

When deleting a track, we hide the track immediately from the listener UI, then use a background queue worker to clean up FGA tuples, S3 audio files, and database records:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Creator Client
    participant API as SaaS Backend API
    participant Queue as BullMQ (track-queue)
    participant Worker as Background Worker
    participant DB as PostgreSQL Database
    participant FGA as OpenFGA Client
    participant S3 as AWS S3 Bucket

    Client->>API: DELETE /api/track/:id
    Note over API: Checks FGA can_delete on track
    API->>DB: Soft delete (set state="deleted" -> immediately hidden from UI)
    API->>DB: Insert Outbox record (DELETE_TRACK, status: PENDING)
    API->>Queue: Dispatch ProcessOutbox job (outboxId)
    API-->>Client: 204 No Content

    %% Background job
    Note over Worker: Worker picks up DELETE_TRACK job
    Worker->>DB: Set Outbox to PROCESSING
    Worker->>FGA: Wipe OpenFGA relation tuples
    Worker->>S3: List & delete all HLS chunks inside processed-tracks/:id/
    Worker->>DB: Hard delete track row (cascades likes/plays/history tables)
    Worker->>DB: Set Outbox to COMPLETED
```
