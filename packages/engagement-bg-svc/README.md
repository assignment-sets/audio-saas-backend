# Engagement Background Service (`@audiosass/engagement-bg-svc`)

This is a lightweight, independent background service written in TypeScript. Its primary scope is to aggregate high-volume user engagement metrics (such as track plays and future interactions like likes, follows, or comments) and write them to the main application in highly optimized batches.

---

## Architecture & Scope

```
[ User Interaction ] ──► [ Main SaaS API ]
                                │ (Buffer in Redis List)
                                ▼
                       [ Redis (Port 6380) ]
                                ▲
                                │ (LRANGE / Batch fetch)
                                │
                  [ Engagement Background Service ]
                                │
                                │ (POST batch payload / 200 OK)
                                ▼
                       [ Main SaaS Webhook ]
                                │
                                │ (Prisma createMany)
                                ▼
                       [ PostgreSQL DB ]
                                │
                                ▼ (Acknowledge Success)
                  [ Engagement Background Service ]
                                │
                                ▼ (LTRIM / Clear processed logs)
```

1. **High-Throughput Buffering**: The main API endpoint pushes user engagement events directly into Redis lists (e.g. `engagement:track-plays`). This bypasses synchronous database roundtrips, allowing the API to respond to clients instantly (approx. < 10ms) and prevents database connection pools from melting under load.
2. **Periodic Aggregation**: This background service wakes up periodically (configured via `INTERVAL_MS`, e.g., every 15–30 seconds) to query a chunk of buffered events from Redis.
3. **Webhook Callback**: It sends a batch of logs to the main application's webhook (`/api/track/webhook/batch-plays`) securely authenticated by a shared secret (`x-webhook-secret`).
4. **Guaranteed Delivery (Zero Data Loss)**: The background service **only** issues the `LTRIM` command to purge processed logs from Redis after it receives a successful `200 OK` response from the webhook. If the webhook fails or the database is down, events are left in Redis to be retried on the next tick automatically.

---

## Local Development Configuration

Before running, make sure to configure a `.env` file inside this directory containing the following environment variables:

```ini
# Redis configuration matching the docker-compose engagement-redis mapping
ENGAGEMENT_REDIS_HOST=localhost
ENGAGEMENT_REDIS_PORT=6380

# Main service webhook configuration
WEBHOOK_URL=http://localhost:5000
WEBHOOK_SECRET=your_shared_webhook_secret_here

# Runner configurations
INTERVAL_MS=30000
BATCH_SIZE=1000
```

---

## Deployment & Production

### 1. Build the Docker Image

To build the Docker image (run this command from the `packages/engagement-bg-svc` directory):

```bash
docker build -t audiosass-engagement-bg-svc .
```

### 2. Run the Docker Container

Since the Redis instance and the main backend are running on the host machine, the container needs a way to communicate with `localhost`.

Select one of the following methods:

#### Method A: Host Networking (Simplest for Linux)

Shares the host network namespace directly. `localhost` inside the container maps exactly to `localhost` on the host machine. You do **not** need to modify your `.env` values.

```bash
docker run --name engagement-bg-svc --restart=no --network=host --env-file .env audiosass-engagement-bg-svc
```

#### Method B: Host Gateway Bridge (Cross-platform)

For macOS, Windows, or general setup. Re-maps host traffic using the `host.docker.internal` bridge:

1. Update your local `.env` values to use the bridge host:
   ```ini
   ENGAGEMENT_REDIS_HOST=host.docker.internal
   WEBHOOK_URL=http://host.docker.internal:5000
   ```
2. Execute the container with the `host-gateway` flag:
   ```bash
   docker run --name engagement-bg-svc --restart=no --add-host=host.docker.internal:host-gateway --env-file .env audiosass-engagement-bg-svc
   ```
