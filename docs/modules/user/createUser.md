```bash
[AUTH0 WEBHOOK]                                         [MAIN APP API]
       │
1. Post-Registration Trigger
       │
       ▼ (Headers: x-sync-secret)
2. internalSyncAuth Middleware ───► Validates secret payload
                                        │
                                        ▼
3. userController.syncUser ───────► Extracts input payload
                                        │
                                        ▼
4. userService.syncUser ──────────► Executes Prisma Upsert
                                        │
                                        ├───► EXISTS: Updates email & name
                                        └───► NEW: Creates fresh database row
```
