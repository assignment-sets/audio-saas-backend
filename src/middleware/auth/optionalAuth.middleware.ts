import type { Request, Response, NextFunction } from 'express';
import { auth } from 'express-oauth2-jwt-bearer';
import { env } from '../../config/env_setup/env';
import { prisma } from '../../lib/prisma';
import { getUserTier } from '../../modules/users/user.service';
import { apiKeyAuth } from './apiKeyAuth.middleware';
import { ForbiddenError } from '../../lib/errors';

const underlyingJwtCheck = auth({
  audience: env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: env.AUTH0_TOKEN_SIGNING_ALGO,
});

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  // 1. Unauthenticated guest
  if (!authHeader && !apiKeyHeader) {
    return next();
  }

  // 2. Delegate to API key middleware
  if (apiKeyHeader || authHeader?.startsWith('Bearer ak_live_')) {
    return apiKeyAuth(req, res, next);
  }

  // 3. Wrap standard Auth0 callback in a Promise so optionalAuth is truly async
  return new Promise((resolve, reject) => {
    underlyingJwtCheck(req, res, async (err) => {
      if (err) {
        // If JWT is invalid/expired, reject so catchAsync routes it to error handler
        return reject(err);
      }

      const auth0Id = req.auth?.payload.sub;
      if (!auth0Id) {
        next();
        return resolve();
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: auth0Id },
          include: {
            artistProfile: true,
            subscriptions: true,
          },
        });

        if (user && (user.isBlocked || user.deletedAt)) {
          return next(new ForbiddenError('Your account has been deactivated.'));
        }

        if (user) {
          const tier = getUserTier(user.subscriptions);
          req.user = {
            ...user,
            tier,
          };
        }

        next();
        resolve();
      } catch (dbError) {
        next(dbError);
        reject(dbError);
      }
    });
  });
};
