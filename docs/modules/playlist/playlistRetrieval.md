# Playlist Retrieval & Paginated Listing

This document explains unified playlist details fetching, soft-auth track personalized states, and cursor-based paginated searching.

---

## 1. Single Playlist Hydration (`GET /api/playlist/:id`)

When fetching a single playlist's details:

- **Security check**: Private playlists check OpenFGA to confirm if the caller has `can_view` rights. If they do not, it returns a `403 Forbidden` error. Public playlists are viewable by anyone.
- **Track personalization**: Utilizes `optionalAuth` middleware. If the caller is authenticated, the tracks inside the playlist return with their personalized `isLiked` status hydrated.

---

## 2. Cursor-Based Pagination & Searching

To retrieve playlists efficiently without database offset penalties (which slow down as offset grows), searching and listing use cursor-based pagination:

- **Search Playlists (`GET /api/playlist`)**: Returns case-insensitive matching public playlists for guests, and public + owned private playlists for authenticated users.
- **Get User Playlists (`GET /api/playlist/user/:userId`)**: Returns the specified user's public playlists. If the requester is fetching their own list, private playlists are also included.

### Request Query Parameters

- `cursor`: string (optional, UUID of the last playlist from the previous page).
- `limit`: number (optional, default 10).
- `search`: string (optional, only for the `/` search endpoint).

### Response Schema

```json
{
  "data": [
    {
      "id": "c17afdc1-e00a-4b07-933d-d4016f8165d5",
      "userId": "auth0|...",
      "name": "Relaxing Lo-Fi",
      "thumbnailUrl": null,
      "isPublic": false,
      "createdAt": "2026-06-27T11:30:00.000Z"
    }
  ],
  "nextCursor": "c17afdc1-e00a-4b07-933d-d4016f8165d5",
  "hasMore": true
}
```

If `hasMore` is `true`, pass the `nextCursor` value into the `cursor` query parameter on the subsequent request to fetch the next page.
