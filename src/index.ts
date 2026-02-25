// src/index.ts ~annotator~
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import userRouter from './modules/users/user.routes';
import artistRouter from './modules/artist/artist.routes';
import { env } from './config/env_setup/env';
import { logger } from './config/logging_setup/logger';
import { errorHandler } from './middleware/errorHandling/errorHandler';
import { initUserWorker } from './queues/workers/user.worker';

const app = express();
const PORT = env.PORT || 5000;

// Middleware
app.use(cors());
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

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
      },
      url: req.url,
    },
    'Unhandled server error',
  );

  res.status(500).json({ error: 'Internal server error' });
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🚀 AudioSaaS Backend running on http://localhost:${PORT}`);
  logger.info(`Sync Endpoint: http://localhost:${PORT}/api/user/sync/internal`);
});

initUserWorker();
logger.info('👷 Background Worker listening for jobs...');
