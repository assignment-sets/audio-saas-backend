# Artist Social Interactions & Followers Retrieval

This document outlines follow/unfollow functionality and how follower lists are paginated using cursor-based pagination.

---

## 1. Social Follow Interactions

Users can follow or unfollow artist profiles:

- **Follow (`POST /api/artist/:id/follow`)**: Creates a join table record in `artist_followers` connecting the active user's ID with the artist profile UUID.
- **Unfollow (`DELETE /api/artist/:id/follow`)**: Deletes the join record from `artist_followers`.
- **Following Status (`GET /api/artist/:id/following`)**: Queries the database to check if a follow relationship currently exists, returning `isFollowing: true | false`.

---

## 2. Paginated Followers Retrieval (`GET /api/artist/:id/followers`)

To support large numbers of followers without database scaling penalties, the followers list uses **cursor-based pagination**:

- **Query ordering**: Ordered by the unique `userId` field to ensure a stable, gapless sort order.
- **Cursor mechanism**: The cursor is the `userId` string of the last follower in the returned page.
- **Page calculation**: The server queries `limit + 1` records. If the count exceeds `limit`, `hasMore` is set to `true`, and the last element is sliced from the result, setting its `userId` as the `nextCursor` for the next request.

### Request Query Parameters

- `cursor`: string (optional, `userId` of the last user returned from the previous page).
- `limit`: number (optional, default 20, max 100).

### Response Layout

```json
{
  "followers": [
    {
      "id": "auth0|6a266f4911a5d6...",
      "displayName": "fanzilla",
      "followedAt": "2026-06-27T12:00:00.000Z"
    }
  ],
  "nextCursor": "auth0|6a266f4911a5d6...",
  "hasMore": true
}
```

If `hasMore` is `true`, pass the `nextCursor` value into the `cursor` query parameter on the subsequent request to fetch the next page.
