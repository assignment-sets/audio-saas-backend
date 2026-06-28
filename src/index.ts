// src/index.ts ~annotator~
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import userRouter from './modules/users/user.routes';
import artistRouter from './modules/artist/artist.routes';
import trackRouter from './modules/track/track.routes';
import albumRouter from './modules/album/album.routes';
import playlistRouter from './modules/playlist/playlist.routes';
import paymentRouter from './modules/payment/payment.routes';

import { env } from './config/env_setup/env';
import { logger } from './config/logging_setup/logger';
import { errorHandler } from './middleware/errorHandling/errorHandler';
import { initUserWorker } from './queues/workers/user.worker';
import { initOutboxWorker } from './queues/workers/artist.worker';
import { initTrackWorker } from './queues/workers/track.worker';

const app = express();
const PORT = env.PORT || 5000;

// Middleware
app.use(cors());
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Basic Request Logger Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(
    { method: req.method, url: req.url, ip: req.ip },
    'Incoming Request',
  );
  next();
});

// Routes
app.use('/api/user', userRouter);
app.use('/api/artist', artistRouter);
app.use('/api/track', trackRouter);
app.use('/api/album', albumRouter);
app.use('/api/playlist', playlistRouter);
app.use('/api/payment', paymentRouter);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 AudioSaaS Backend running on http://localhost:${PORT}`);
  logger.info(`Sync Endpoint: http://localhost:${PORT}/api/user/sync/internal`);
});

initUserWorker();
initOutboxWorker();
initTrackWorker();

logger.info('👷 Background Worker listening for jobs...');
