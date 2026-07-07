# Subscription Limits & Benefits Documentation

This document describes the tier-based limits enforced on playlists, track capacities, and artist manager delegations.

---

## 1. Limits & Capabilities Matrix

The centralized configuration for these limits is defined in the [subscriptionLimits.ts](../../../src/config/constants/subscriptionLimits.ts) configuration file.

| Limit / Capability          | `FREE` Tier                     | `LITE` Tier       | `PRO` Tier        |
| :-------------------------- | :------------------------------ | :---------------- | :---------------- |
| **Max Playlists**           | 3 playlists                     | 20 playlists      | Unlimited         |
| **Max Tracks per Playlist** | 15 tracks                       | 100 tracks        | Unlimited         |
| **Playlist Privacy**        | Public only (`isPublic = true`) | Public or Private | Public or Private |
| **Max Managers per Artist** | 1 manager                       | 2 managers        | 5 managers        |

---

## 2. Code Implementation & References

### A. Central Configuration

- **Constant**: `SUBSCRIPTION_LIMITS`
- **Type/Interface**: `TierLimits`
- **Location**: [subscriptionLimits.ts](../../../src/config/constants/subscriptionLimits.ts)

---

### B. Playlist Limit Enforcement

Implemented in the playlist service file: [playlist.service.ts](../../../src/modules/playlist/playlist.service.ts)

1.  **`enforcePlaylistLimits`**
    - _Purpose_: Restricts the total number of playlists a user can create and blocks creation/updates of private playlists for `FREE` tier users.
    - _Called By_:
      - `createPlaylist` (checking both quantity and privacy)
      - `updatePlaylist` (checking privacy changes)
2.  **`enforcePlaylistCapacityLimit`**
    - _Purpose_: Enforces a maximum track count per playlist depending on the playlist owner's subscription tier.
    - _Called By_:
      - `addTracksToPlaylist`

---

### C. Artist Manager Limit Enforcement

Implemented in the artist service file: [artist.service.ts](../../../src/modules/artist/artist.service.ts)

- **`enforceManagerLimit`**
  - _Purpose_: Enforces the maximum number of manager accounts that can be assigned to an artist profile, based on the owner's subscription tier.
  - _Called By_:
    - `appointManager`

---

## 3. Limit Breach API Error Response (HTTP 402)

When any of the tier limits are breached, the backend API rejects the request with an HTTP **`402 Payment Required`** status code. This allows frontend clients to intercept the status globally and display an Upgrade Modal.

### API Error Body Structure

```json
{
  "success": false,
  "error": "The detailed limit message here"
}
```

### Potential Error Message Strings

- **Max Playlists Limit**: `"Playlist limit reached. Your current tier (FREE) only allows up to 3 playlists."`
- **Playlist Privacy Option Restricted**: `"Private playlists are only available on paid subscription plans."`
- **Playlist Capacity Limit**: `"Playlist capacity exceeded. Your current tier (FREE) limits playlists to a maximum of 15 tracks."`
- **Artist Profile Managers Limit**: `"Your current tier (FREE) only allows a maximum of 1 manager(s). Please upgrade to add more."`
