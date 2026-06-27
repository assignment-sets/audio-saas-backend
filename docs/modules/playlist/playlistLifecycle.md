# Playlist Lifecycle & Authorization

This document details the lifecycle of a playlist, including CRUD actions, limits, and OpenFGA visibility policies.

---

## 1. Playlist Lifecycle & Authorization

Playlists support standard CRUD operations. Access control is validated using OpenFGA depending on whether the playlist is public or private:

```mermaid
stateDiagram-v2
    [*] --> PRIVATE : POST /api/playlist (isPublic=false)
    [*] --> PUBLIC : POST /api/playlist (isPublic=true)

    PRIVATE --> PUBLIC : PATCH /api/playlist/{id} (isPublic=true)
    PUBLIC --> PRIVATE : PATCH /api/playlist/{id} (isPublic=false)

    PRIVATE --> [*] : DELETE /api/playlist/{id}
    PUBLIC --> [*] : DELETE /api/playlist/{id}

    note right of PRIVATE
        - Only owner & collaborators can view/edit
        - FGA relation checks: can_view / can_edit
    end note

    note right of PUBLIC
        - Anyone (including guests) can view/stream
        - Only owner & collaborators can edit
    end note
```

---

## 2. Limits & Rules Summary

The playlist services enforce hardcoded constraints during write transactions:

- **Playlist Limit**: A maximum of **10 playlists** can be created per user. If this threshold is reached, creation attempts are rejected with a `400 Bad Request` block.
- **Decoupled Metadata**: Playlist tracks link directly to the central `Track` table. Play counts, likes, and transcode statuses are preserved natively.
