```bash
[FRONTEND CLIENT]             [MAIN APP API]             [REDIS & BACKGROUND WORKER]
       │
1. DELETE /api/track/:id
       │
       ▼ (Hydrated Context)
2. deleteTrack Service ───────► Checks OpenFGA can_delete on target track:id
                                │
                                ▼
3. DB Transaction (prisma.$transaction)
       ├───► Step A: Updates Track record status (state: 'deleted' -> immediately hidden from UI)
       └───► Step B: Inserts Outbox record (DELETE_TRACK, status: PENDING)
       │
       ▼ (Database Commit Complete)
4. Push to 'track-queue' ─────► Dispatches JobName.PROCESS_OUTBOX ──────┐
                                (Payload contains unique outboxId)      │
                                                                        ▼
                                                       5. Track Worker Picks Up Job
                                                              │───► Sets Outbox to PROCESSING
                                                              │
                                                              ▼
                                                       6. OpenFGA Relationship Wiped
                                                              │───► Deletes tuple: track -> parent_artist
                                                              │
                                                              ▼
                                                       7. S3 Asset Bucket Purge
                                                              │───► Lists all contents inside `processed-tracks/:id/`
                                                              │───► Multi-object Delete request executed for HLS chunks
                                                              │
                                                              ▼
                                                       8. Database Hard Purge
                                                              │───► Deletes track row from Postgres
                                                              │───► Cascade rules drop all track_likes & track_plays
                                                              │
                                                              ▼
                                                       9. Update Outbox Record
                                                              └───► Sets status to COMPLETED
```
