import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { logger } from '../../config/logging_setup/logger';

export const hydrateUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth0Id = req.auth?.payload.sub;

  if (!auth0Id) {
    return next(); // Let jwtCheck handle the missing token errors
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth0Id },
    });

    if (!user) {
      throw new NotFoundError('User record not found in database.');
    }

    // THE KILL SWITCH
    if (user.isBlocked || user.deletedAt) {
      logger.warn(
        { userId: auth0Id },
        'Blocked or deleted user attempted access',
      );
      throw new ForbiddenError('Your account has been deactivated.');
    }

    // Attach the actual Prisma user object to the request
    // Note: You might need to extend the Express Request type for 'user'
    (req as any).user = user;

    next();
  } catch (error) {
    next(error);
  }
};
