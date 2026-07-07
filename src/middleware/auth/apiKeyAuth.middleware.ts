import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { UnauthorizedError, ForbiddenError } from '../../lib/errors';
import { getUserTier } from '../../modules/users/user.service';
import { logger } from '../../config/logging_setup/logger';

export const apiKeyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  let rawKey: string | undefined;

  if (typeof apiKeyHeader === 'string') {
    rawKey = apiKeyHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    rawKey = authHeader.substring(7);
  }

  if (!rawKey || !rawKey.startsWith('ak_live_')) {
    return next(
      new UnauthorizedError('Unauthorized: Missing or invalid API key format.'),
    );
  }

  try {
    // Compute SHA-256 hash of the raw API key to query DB
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          include: {
            artistProfile: true,
            subscriptions: true,
          },
        },
      },
    });

    if (!apiKeyRecord) {
      return next(new UnauthorizedError('Unauthorized: Invalid API Key.'));
    }

    const { user } = apiKeyRecord;

    // Enforce deactivation checks
    if (user.isBlocked || user.deletedAt) {
      logger.warn(
        { userId: user.id },
        'API Key request blocked for deactivated account.',
      );
      return next(new ForbiddenError('Your account has been deactivated.'));
    }

    // Hydrate request user object exactly like Auth0 hydration does
    const tier = getUserTier(user.subscriptions);
    req.user = {
      ...user,
      tier,
    };

    next();
  } catch (error) {
    next(error);
  }
};
