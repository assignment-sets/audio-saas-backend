# Local config

## Postgres container

```bash
docker run -d \
 --name music-db \
 -e POSTGRES_USER=postgres \
 -e POSTGRES_PASSWORD=postgres \
 -e POSTGRES_DB=postgres \
 -p 5432:5432 \
 -v pg_music_data:/var/lib/postgresql/data \
 38a11138d965
```

## Ngrok temporary url

```bash
SYNC_URL="https://subturriculated-unpublicly-shari.ngrok-free.dev/api/user/sync/internal"
```

## Auth0 actions post login sync

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const axios = require("axios");
  const namespace = "https://api.<api-identifier-url>.com"; // Auth0 API identifier

  // ATTACH CUSTOM CLAIMS
  // This makes these fields visible in req.auth.payload on your backend
  if (event.authorization) {
    api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
    api.accessToken.setCustomClaim(
      `${namespace}/nickname`,
      event.user.nickname || "",
    );
    api.accessToken.setCustomClaim(
      `${namespace}/displayName`,
      event.user.name || "",
    );
  }

  // User sync with backend
  if (!event.user.app_metadata.is_synced) {
    const payload = {
      id: event.user.user_id,
      email: event.user.email,
      displayName: event.user.name || event.user.nickname || "",
    };

    try {
      await axios.post(event.secrets.SYNC_URL, payload, {
        headers: {
          "x-sync-secret": event.secrets.INTERNAL_SYNC_SECRET,
          "ngrok-skip-browser-warning": "true",
        },
        timeout: 5000,
      });

      api.user.setAppMetadata("is_synced", true);
    } catch (err) {
      console.error("Sync failed, blocking login:", err.message);
      // If the DB is not reachable, no token provided
      api.access.deny("Initialization failed. Please try again in a moment.");
    }
  }
};
```
