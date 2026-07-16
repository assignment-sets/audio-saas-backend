// src/middleware/errorHandling/errorHandler.ts ~annotator~
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors';
import { logger } from '../../config/logging_setup/logger';
import { env } from '../../config/env_setup/env';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (
    err.name === 'UnauthorizedError' ||
    'statusCode' in err ||
    'status' in err
  ) {
    statusCode = (err as any).statusCode || (err as any).status || 401;
    message = err.message || 'Unauthorized';
    if ('headers' in err && typeof (err as any).headers === 'object') {
      res.set((err as any).headers);
    }
  } else {
    // This is an unhandled error (e.g., a library crashed or DB connection failed)
    logger.error({ err }, 'Unhandled Exception');
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
