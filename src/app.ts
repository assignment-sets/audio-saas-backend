import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import userRouter from './modules/users/user.routes';
import artistRouter from './modules/artist/artist.routes';
import trackRouter from './modules/track/track.routes';
import albumRouter from './modules/album/album.routes';
import playlistRouter from './modules/playlist/playlist.routes';
import paymentRouter from './modules/payment/payment.routes';
import searchRouter from './modules/search/search.routes';
import { logger } from './config/logging_setup/logger';
import { errorHandler } from './middleware/errorHandling/errorHandler';

const app = express();

// Middleware
app.use(cors());
app.use('/api/v1/payment/webhook', express.raw({ type: 'application/json' }));
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
app.use('/api/v1/user', userRouter);
app.use('/api/v1/artist', artistRouter);
app.use('/api/v1/track', trackRouter);
app.use('/api/v1/album', albumRouter);
app.use('/api/v1/playlist', playlistRouter);
app.use('/api/v1/payment', paymentRouter);
app.use('/api/v1/search', searchRouter);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global Error Handler
app.use(errorHandler);

export default app;
