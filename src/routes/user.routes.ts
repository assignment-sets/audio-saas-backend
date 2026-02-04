import { Router } from "express";
import { internalSyncAuth } from "../middleware/internalAuth.middleware";
import * as userService from "../service/user.service";
import { syncUserSchema } from "../schemas/user.schema";
import { logger } from "../config/logger";
import { z } from "zod";

const router = Router();

router.post("/sync/internal", internalSyncAuth, async (req, res) => {
  const { id, email } = req.body;

  logger.info({ id, email }, "Received user sync request from Auth0");

  try {
    const { id, email, displayName } = req.body;

    const validatedData = syncUserSchema.parse({
      id,
      email,
      displayName: displayName || email?.split("@")[0],
    });

    const user = await userService.syncUser(validatedData);

    logger.info({ userId: user.id }, "User sync completed successfully");
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error(
        {
          issues: error.issues,
          received: req.body,
        },
        "User sync validation failed",
      );

      return res.status(400).json({
        error: "Validation failed",
        details: error.issues,
      });
    }

    logger.error(
      { err: error, body: req.body },
      "Unexpected error during internal user sync",
    );

    res.status(400).json({
      error: "Sync failed",
    });
  }
});

export default router;
