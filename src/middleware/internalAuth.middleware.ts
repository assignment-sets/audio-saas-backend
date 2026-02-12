// src/middleware/internalAuth.middleware.ts ~annotator~
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";

export const internalSyncAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const syncSecret = req.header("x-sync-secret");

  if (!syncSecret || syncSecret !== env.AUTH0_INTERNAL_SYNC_SECRET) {
    logger.warn(
      {
        ip: req.ip,
        method: req.method,
        url: req.originalUrl,
        hasSecret: !!syncSecret,
      },
      "Unauthorized internal sync attempt blocked",
    );

    return res.status(401).json({ error: "Unauthorized" });
  }

  logger.debug(
    { url: req.originalUrl },
    "Internal sync authentication successful",
  );

  next();
};
