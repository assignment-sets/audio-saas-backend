import type { Request, Response, NextFunction } from 'express';
import { jwtCheck } from './auth0.middleware';
import { hydrateUser } from './userHydration.middleware';

export const auth0JwtAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  jwtCheck(req, res, (err) => {
    if (err) return next(err);
    hydrateUser(req, res, next);
  });
};
