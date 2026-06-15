```bash
[FRONTEND CLIENT]             [MAIN APP API]                    [REDIS & BACKGROUND WORKER]
       │
1. DELETE /api/user
       │
       ▼ (Hydrated Context)
2. userService.deleteUser
       │
       ▼
3. Auth0 Management Client ──► Immediately sets user status to BLOCKED
       │
       ▼
4. DB Update (Soft Delete) ──► Saves local states: isBlocked = true, deletedAt = now()
       │
       ▼
5. Push to 'user-queue' ─────► Dispatches JobName.USER_CLEANUP ───┐
                                (Payload contains unique userId)  │
                                                                  ▼
                                                   6. User Worker Picks Up Job
                                                          │
                                                          ▼
                                                   7. OpenFGA Cleanup
                                                          │───► Reads all current user tuples
                                                          │───► Issues batch hard-delete writes
                                                          │
                                                          ▼
                                                   8. Auth0 Permanent Purge
                                                          │───► Deletes profile from Auth0 cluster
                                                          │───► Skips if 404 (Idempotent check)
                                                          │
                                                          ▼
                                                   9. Database Hard Delete
                                                          │───► Cascades deletion via schema mappings
                                                          │───► Completely wipes remaining footprints
```
