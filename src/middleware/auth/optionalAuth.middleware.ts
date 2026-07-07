import { auth } from 'express-oauth2-jwt-bearer';
import { env } from '../../config/env_setup/env';
import { prisma } from '../../lib/prisma';
import type { Request, Response, NextFunction } from 'express';
import { getUserTier } from '../../modules/users/user.service';
import { apiKeyAuth } from './apiKeyAuth.middleware';

// Underlying JWT verifier from Auth0
const underlyingJwtCheck = auth({
  audience: env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: env.AUTH0_TOKEN_SIGNING_ALGO,
});

/**
 * Smart optional authentication middleware.
 * If no Authorization or x-api-key header is present, the request proceeds as a guest (req.user remains undefined).
 * If valid credentials are provided (either API key or JWT), req.user is hydrated.
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  // 1. If absolutely no credentials are provided, proceed as a guest
  if (!authHeader && !apiKeyHeader) {
    return next();
  }

  // 2. If API Key is present, delegate authentication
  if (
    apiKeyHeader ||
    (authHeader && authHeader.startsWith('Bearer ak_live_'))
  ) {
    return apiKeyAuth(req, res, next);
  }

  underlyingJwtCheck(req, res, async (err) => {
    if (err) {
      // Malformed or expired token gets blocked for security
      return next(err);
    }

    const auth0Id = req.auth?.payload.sub;
    if (!auth0Id) return next();

    try {
      const user = await prisma.user.findUnique({
        where: { id: auth0Id },
        include: {
          artistProfile: true,
          subscriptions: true,
        },
      });

      // Kill switch for deactivated accounts
      if (user && (user.isBlocked || user.deletedAt)) {
        return res
          .status(403)
          .json({ error: 'Your account has been deactivated.' });
      }

      if (user) {
        const tier = getUserTier(user.subscriptions);
        req.user = {
          ...user,
          tier,
        };
      }

      next();
    } catch (dbError) {
      next(dbError);
    }
  });
};
