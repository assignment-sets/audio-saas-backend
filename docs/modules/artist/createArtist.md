```bash
[FRONTEND CLIENT]             [MAIN APP API]                    [REDIS & BACKGROUND WORKER]
       │
1. POST /api/artist
       │
       ▼ (Hydrated req.user Context)
2. userService.createProfile
       │
       ▼
3. DB Transaction (prisma.$transaction)
       ├───► Step A: Inserts new record into 'artist_profiles' table
       └───► Step B: Inserts Outbox intent record (CREATE_ARTIST_PROFILE, status: PENDING)
       │
       ▼ (Database Commit Complete)
4. Push to 'artist-queue' ────► Dispatches JobName.PROCESS_OUTBOX ──┐
                                (Payload contains unique outboxId) │
                                                                   ▼
                                                   5. Artist Worker Picks Up Job
                                                          │
                                                          ▼
                                                   6. State Lock
                                                          │───► Sets Outbox status to PROCESSING
                                                          │───► Increments internal execution counter
                                                          │
                                                          ▼
                                                   7. OpenFGA Relationship Setup
                                                          │───► Writes tuple: user:X -> owner -> artist_profile:Y
                                                          │───► Writes tuple: platform:mainApp -> platform_ref -> artist_profile:Y
                                                          │
                                       ┌──────────────────┴──────────────────┐
                                       ▼ (SUCCESS)                           ▼ (MAX RETRIES EXHAUSTED)
                        8. Finalize Outbox Task                      9. SAGA Compensating Transaction
                                       │                                     │
                                       ▼                                     ▼
                        Sets Outbox status to COMPLETED             Wipes "Ghost Profile" via prisma.artistProfile.delete
                                                                    Sets Outbox status to FAILED_AND_ROLLED_BACK
```
