import { auth } from 'express-oauth2-jwt-bearer';
import { env } from '../../config/env_setup/env';
import { prisma } from '../../lib/prisma';
import type { Request, Response, NextFunction } from 'express';

// Underlying JWT verifier from Auth0
const underlyingJwtCheck = auth({
  audience: env.AUTH0_AUDIENCE,
  issuerBaseURL: `https://${env.AUTH0_DOMAIN}/`,
  tokenSigningAlg: env.AUTH0_TOKEN_SIGNING_ALGO,
});

/**
 * Smart optional authentication middleware.
 * If no Authorization header is present, the request proceeds as a guest (req.user remains undefined).
 * If a token is present, it is verified via Auth0. Invalid tokens trigger 401/403.
 * Valid tokens hydrate req.user from the database.
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.headers.authorization) {
    return next();
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
        include: { artistProfile: true },
      });

      // Kill switch for deactivated accounts
      if (user && (user.isBlocked || user.deletedAt)) {
        return res
          .status(403)
          .json({ error: 'Your account has been deactivated.' });
      }

      (req as any).user = user;
      next();
    } catch (dbError) {
      next(dbError);
    }
  });
};
