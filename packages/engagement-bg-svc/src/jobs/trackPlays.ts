import { redis } from '../../lib/redis.js';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '1000', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export interface TrackPlayEvent {
  userId?: string | null;
  trackId: string;
  durationPlayedSeconds: number;
  playedAt?: string;
}

export async function processTrackPlays(): Promise<void> {
  if (!WEBHOOK_URL) {
    console.error('Error: WEBHOOK_URL environment variable is not defined.');
    return;
  }

  try {
    // 1. Fetch the first BATCH_SIZE elements
    const rawPlays = await redis.lrange(
      'engagement:track-plays',
      0,
      BATCH_SIZE - 1,
    );
    if (rawPlays.length === 0) {
      return;
    }

    console.log(`Processing batch of ${rawPlays.length} track plays...`);

    // 2. Parse payload items
    const plays: TrackPlayEvent[] = rawPlays.map((item: string) =>
      JSON.parse(item),
    );

    // 3. Post to the webhook using global fetch
    const response = await fetch(
      `${WEBHOOK_URL}/api/v1/track/webhook/batch-plays`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': WEBHOOK_SECRET || '',
        },
        body: JSON.stringify({ plays }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Webhook responded with status ${response.status}: ${errorText}`,
      );
    }

    // 4. LTRIM to remove only the processed elements.
    // Trimming starting from index rawPlays.length keeps all elements from rawPlays.length onwards.
    await redis.ltrim('engagement:track-plays', rawPlays.length, -1);
    console.log(
      `Successfully completed batch of ${rawPlays.length} track plays.`,
    );
  } catch (error: any) {
    console.error('Failed to process track plays batch:', error.message);
  }
}
