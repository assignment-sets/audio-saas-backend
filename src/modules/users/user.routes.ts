import { Router } from "express";
import { internalSyncAuth } from "../../middleware/auth/internalAuth.middleware";
import { jwtCheck } from "../../middleware/auth/auth0.middleware";
import { hydrateUser } from "../../middleware/auth/userHydration.middleware";
import { validate } from "../../middleware/validation/validate.middleware";
import { catchAsync } from "../../middleware/errorHandling/asyncWrapper";
import * as userController from "./user.controller";
import { syncUserSchema, updateUserSchema } from "./user.schema";

const router = Router();

/**
 * 1. Public / Internal Service Routes
 * These bypass JWT/Hydration because they use Service-to-Service auth.
 */
router.post(
  "/sync/internal",
  internalSyncAuth,
  validate(syncUserSchema),
  catchAsync(userController.syncUser),
);

/**
 * 2. Security & Data Hydration Layer
 * Every route defined AFTER these two lines requires a valid JWT
 * and an active (non-blocked) user in our database.
 */
router.use(jwtCheck);
router.use(catchAsync(hydrateUser));

/**
 * 3. Protected User Routes
 * The controller now has access to 'req.user' automatically.
 */
router.get(
  "/",
  catchAsync(userController.getCurrentUser),
);

router.patch(
  "/",
  validate(updateUserSchema),
  catchAsync(userController.updateUser),
);

router.delete("/", catchAsync(userController.deleteUser));

export default router;
