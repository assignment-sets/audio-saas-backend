import 'dotenv/config';
import { processTrackPlays } from './jobs/trackPlays.js';

const INTERVAL_MS = parseInt(process.env.INTERVAL_MS || '30000', 10);

console.log(
  `🚀 Engagement background service started. Polling interval: ${INTERVAL_MS}ms`,
);

async function tick(): Promise<void> {
  try {
    await processTrackPlays();
    // Future additions (e.g., likes, comments, follows) can be invoked here:
    // await processTrackLikes();
  } catch (error) {
    console.error('Unhandled error in aggregator tick:', error);
  } finally {
    setTimeout(tick, INTERVAL_MS);
  }
}

// Start the loop
tick();
