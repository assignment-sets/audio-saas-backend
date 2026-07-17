// src/config/logging_setup/logger.ts ~annotator~
import pino from 'pino';
import { env } from '../env_setup/env';

const isProd = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

export const logger = pino({
  // If it's test, kill logs completely. Otherwise, prod gets info, dev gets debug.
  level: isTest ? 'silent' : isProd ? 'info' : 'debug',

  // Pretty logs in dev, skip formatting in test/prod
  transport:
    !isProd && !isTest
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,

  base: {
    service: 'api',
  },
});
