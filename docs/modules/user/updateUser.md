```bash
[FRONTEND CLIENT]                                       [MAIN APP API]
       │
1. PATCH /api/user
       │
       ▼ (Headers: Bearer JWT)
2. Security & Hydration Layer ────► Decodes JWT Check
                                  ► Fetches user record from DB
                                  ► Blocks if isBlocked || deletedAt is True
                                        │
                                        ▼
3. userService.updateUser ────────► Strips out Social Login IDs (Google/OAuth)
                                        │
                                        ▼
4. Auth0 Management Client ───────► Requests profile field change in Auth0
                                        │
                     ┌──────────────────┴──────────────────┐
                     ▼ (SUCCESS)                           ▼ (FAILURE)
5. DB Update (prisma.user.update)               Throws BadRequestError
                     │                                (Stops Execution)
      ┌──────────────┴──────────────┐
      ▼ (SUCCESS)                   ▼ (DATABASE CRASH)
6. Return Fresh User Object      7. Reversion Saga Triggered
                                    │
                                    ▼
                                 Auth0 Management rollback forced
                                 (Resets Auth0 fields to initial state)
                                    │
                                    ▼
                                 Throws InternalServerError
```
