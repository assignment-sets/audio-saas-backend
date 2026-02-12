// src/routes/user.routes.ts ~annotator~
import { Router } from "express";
import type { Request, Response } from "express";
import { internalSyncAuth } from "../middleware/internalAuth.middleware";
import { jwtCheck } from "../middleware/auth0.middleware";
import * as userService from "../service/user.service";
import {
  syncUserSchema,
  updateUserSchema,
  getUserSchema,
} from "../schemas/user.schema";
import { catchAsync } from "../middleware/asyncWrapper";
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../lib/errors";

const router = Router();

/**
 * Internal Sync Route
 */
router.post(
  "/sync/internal",
  internalSyncAuth,
  catchAsync(async (req: Request, res: Response) => {
    const result = syncUserSchema.safeParse({
      ...req.body,
      displayName: req.body.displayName || req.body.email?.split("@")[0],
    });

    if (!result.success) {
      throw new ValidationError("Validation failed", result.error.issues);
    }

    const user = await userService.syncUser(result.data);
    return res.status(201).json(user);
  }),
);

/**
 * GET Current User
 */
router.get(
  "/",
  jwtCheck,
  catchAsync(async (req: Request, res: Response) => {
    const auth0Id = req.auth?.payload.sub;

    const result = getUserSchema.safeParse({ id: auth0Id });
    if (!result.success) {
      throw new ValidationError("Invalid User ID", result.error.issues);
    }

    const user = await userService.getUserById(result.data);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    return res.json(user);
  }),
);

/**
 * PATCH User Details
 */
router.patch(
  "/",
  jwtCheck,
  catchAsync(async (req: Request, res: Response) => {
    const auth0Id = req.auth?.payload.sub;
    if (!auth0Id) throw new UnauthorizedError();

    const result = updateUserSchema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError("Invalid update data", result.error.issues);
    }

    if (Object.keys(result.data).length === 0) {
      throw new ValidationError("Update data required");
    }

    const updatedUser = await userService.updateUser(auth0Id, result.data);
    return res.json(updatedUser);
  }),
);

/**
 * DELETE User
 */
router.delete(
  "/",
  jwtCheck,
  catchAsync(async (req: Request, res: Response) => {
    const auth0Id = req.auth?.payload.sub;
    if (!auth0Id) throw new UnauthorizedError();

    await userService.deleteUser(auth0Id);
    return res.status(204).send();
  }),
);

export default router;
