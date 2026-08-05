import './lib/datadog.tracer';

import app from './app';
import { env } from './config/env_setup/env';
import { logger } from './config/logging_setup/logger';
import { initUserWorker } from './queues/workers/user.worker';
import { initOutboxWorker } from './queues/workers/artist.worker';
import { initTrackWorker } from './queues/workers/track.worker';

const PORT = env.PORT || 5000;

app.listen(PORT, () => {
  logger.info(`🚀 AudioSaaS Backend running on http://localhost:${PORT}`);
  logger.info(
    `Sync Endpoint: http://localhost:${PORT}/api/v1/user/sync/internal`,
  );
});

initUserWorker();
initOutboxWorker();
initTrackWorker();

logger.info('👷 Background Worker listening for jobs...');
