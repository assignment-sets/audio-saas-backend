# User Profile Lifecycle

This document describes the complete lifecycle of a user profile: synchronization from Auth0 registration, metadata updates, soft-deletion, and asynchronous permanent scrubbing via background workers.

---

## 1. User Creation & Sync Flow

When a user registers via Auth0, a post-registration trigger webhook calls our internal sync endpoint to register the user record in the database.

```mermaid
sequenceDiagram
    autonumber
    participant Auth0 as Auth0 Webhook Trigger
    participant API as SaaS Backend API
    participant DB as PostgreSQL Database

    Auth0->>API: POST /api/user/sync/internal (Headers: x-sync-secret)
    Note over API: internalSyncAuth Middleware verifies secret
    API->>DB: Upsert user record (syncs email & displayName)
    DB-->>API: Row created/updated
    API-->>Auth0: 210 Created (User Object)
```

---

## 2. Profile Updates & Saga Rollbacks

Updates to a user's details (e.g. `displayName`) are synchronized to both the local database and Auth0. If the database update fails after Auth0 has been modified, a reversion Saga rolls back the change in Auth0 to maintain consistency.

```mermaid
sequenceDiagram
    autonumber
    actor Client as User Client
    participant API as SaaS Backend API
    participant Auth0 as Auth0 Management API
    participant DB as PostgreSQL Database

    Client->>API: PATCH /api/user { displayName }
    Note over API: Hydrates req.user context
    API->>Auth0: Request profile update in Auth0 cluster
    alt Auth0 Success
        Auth0-->>API: 200 OK
        API->>DB: Update local user record
        alt Database Success
            DB-->>API: 200 OK
            API-->>Client: 200 OK (Updated User)
        else Database Failure
            DB-->>API: SQL Error (Crash)
            Note over API: Saga Triggered: Rollback Auth0 fields
            API->>Auth0: Reset Auth0 profile fields to previous state
            API-->>Client: 500 Internal Server Error
        end
    else Auth0 Failure
        Auth0-->>API: Auth0 Error
        API-->>Client: 400 Bad Request (Stops Execution)
    end
```

---

## 3. Account Deactivation & Deletion Saga

When a user deletes their account, we execute a soft delete immediately to block access. A background worker then cleans up all relations (OpenFGA tuples, database records) asynchronously before permanently wiping the profile.

```mermaid
sequenceDiagram
    autonumber
    actor Client as User Client
    participant API as SaaS Backend API
    participant Auth0 as Auth0 Management API
    participant Queue as BullMQ (user-queue)
    participant Worker as Background Worker
    participant DB as PostgreSQL Database

    Client->>API: DELETE /api/user
    Note over API: Hydrates context & checks account status
    API->>Auth0: Immediately sets user status to BLOCKED
    API->>DB: Soft delete (set isBlocked=true, deletedAt=now())
    API->>Queue: Dispatch USER_CLEANUP job (userId)
    API-->>Client: 204 No Content

    %% Background Job
    Note over Worker: Worker picks up USER_CLEANUP job
    Worker->>DB: Read user & check status
    Worker->>DB: Wipe OpenFGA tuples (reads and batch deletes)
    Worker->>Auth0: Permanently deletes user from Auth0 cluster
    Worker->>DB: Hard delete (cascades database wipe via schema keys)
    Note over Worker: Job completed successfully
```
