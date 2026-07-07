import type { Request, Response, NextFunction } from 'express';
import { apiKeyAuth } from './apiKeyAuth.middleware';
import { auth0JwtAuth } from './auth0JwtAuth.middleware';

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  // Route to API Key verification if header or ak_live_ bearer token is present
  if (
    apiKeyHeader ||
    (authHeader && authHeader.startsWith('Bearer ak_live_'))
  ) {
    return apiKeyAuth(req, res, next);
  }

  // Otherwise, fall back to the standard Auth0 JWT flow
  return auth0JwtAuth(req, res, next);
};
