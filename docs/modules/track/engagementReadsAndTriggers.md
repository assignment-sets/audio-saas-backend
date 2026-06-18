# Track Engagement Counts & Liked Status (`GET /api/track/artist/:artistId`)

To ensure high-performance, real-time reads for track engagement counts and personalization, the backend utilizes PostgreSQL database triggers for counting, combined with separate public and private retrieval endpoints.

---

## 1. Database-Level Counters (Triggers)

Instead of executing slow aggregate queries (`COUNT(*)`) or performing table joins on every read, counters for plays and likes are maintained directly on the `tracks` table.

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

    LikeTrigger -->|Increment/Decrement| TracksDB[(Tracks Table: play_count / like_count)]
    PlayTrigger -->|Increment/Decrement| TracksDB
```

- **Trigger Mechanisms:**
  - `track_likes_count_trigger`: Triggers `AFTER INSERT OR DELETE` on `track_likes`. Updates `like_count` on the corresponding row in the `tracks` table.
  - `track_plays_count_trigger`: Triggers `AFTER INSERT OR DELETE` on `track_plays`. Updates `play_count` on the corresponding row in the `tracks` table.
- **Benefits:** Reads are $O(1)$ directly from the track row without joins or calculations.

---

## 2. Public vs. Private Retrieval Flow

The client queries different endpoints depending on the authentication state of the user. This keeps the public endpoint fast and fully cacheable, while the private endpoint dynamically hydates personalization data.

```mermaid
sequenceDiagram
    autonumber
    actor Guest as Unauthenticated Client
    actor Member as Authenticated Client
    participant API as SaaS Backend API
    participant DB as PostgreSQL Database

    %% Unauthenticated Flow
    Guest->>API: GET /api/track/artist/:artistId
    Note over API: No JWT check required
    API->>DB: Fetch tracks (select play_count, like_count)
    DB-->>API: Returns tracks
    Note over API: Map isLiked = false for all tracks
    API-->>Guest: Return JSON [ { title: "Song", playCount: 50, likeCount: 10, isLiked: false } ]

    %% Authenticated Flow
    Member->>API: GET /api/track/artist/:artistId/pvt
    Note over API: Strict JWT check & Hydrate User
    API->>DB: Fetch tracks + Include likes where userId = req.user.id
    DB-->>API: Returns tracks with matching like rows
    Note over API: Map isLiked = true/false based on like existence
    API-->>Member: Return JSON [ { title: "Song", playCount: 50, likeCount: 10, isLiked: true } ]
```

- **Public Route (`GET /api/track/artist/:artistId`):**
  - Serves unauthenticated traffic.
  - Returns raw track data including `playCount` and `likeCount`.
  - Automatically maps `isLiked: false` for the entire response.
- **Private Route (`GET /api/track/artist/:artistId/pvt`):**
  - Protected by Auth0 `jwtCheck` and `hydrateUser`.
  - Fetches the track list while querying the `likes` relationship specifically for the logged-in user.
  - Dynamically sets `isLiked` to `true` or `false` based on whether the relation exists.
