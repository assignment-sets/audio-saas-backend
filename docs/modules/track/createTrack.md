```bash
[FRONTEND CLIENT]             [MAIN APP API]             [REDIS & EXTERNALS]
       │
1. POST /api/track/upload-url
       │
       ▼ (Hydrated Context)
2. generateAudioUploadUrl ────► Checks OpenFGA can_edit on artist_profile
                                ► Generates random UUID S3 key
                                ► Returns short-lived Pre-signed PUT URL
       │
       ▼ (Client uploads raw file directly to S3 Bucket)
3. POST /api/track
       │
       ▼ (Validates request payload)
4. createTrack Service ───────► Checks OpenFGA can_manage on artist_profile
                                │
                                ▼
5. DB Transaction (prisma.$transaction)
       ├───► Step A: Inserts Track record (state: 'processing')
       └───► Step B: Inserts Outbox record (CREATE_TRACK, status: PENDING)
       │
       ▼ (Database Commit Complete)
6. Push to 'track-queue' ─────► Dispatches JobName.PROCESS_OUTBOX ──────┐
                                (Payload contains unique outboxId)      │
                                                                        ▼
                                                       7. Track Worker Picks Up Job
                                                              │───► Sets Outbox to PROCESSING
                                                              │───► Writes OpenFGA Tuple: track -> parent_artist
                                                              │
8. Handshake Cross-Queue ◄────────────────────────────────────┘
   │ (Dispatches JobName.TRANSCODE_TRACK with outboxId)
   │
   ▼
[FFMPEG TRANSCODER CONTAINER]
   │───► Downloads raw audio key from S3 Bucket
   │───► Transcodes audio file into HLS structure (.m3u8 playlist + .ts chunks)
   │───► Uploads processed web assets directory back to S3 Bucket
   │
   ▼
9. POST /api/track/webhook/transcode
   │ (Main app processes success/failure payload from transcoder)
   │
   ▼
10. Finalize Pipeline ────────► DB Transaction
                                   ├───► Updates Track record (state: 'ready')
                                   └───► Updates Outbox record (status: COMPLETED)
```
