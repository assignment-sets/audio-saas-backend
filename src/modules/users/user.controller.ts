import type { Request, Response } from "express";
import * as userService from "./user.service";
import type { User } from "@prisma/client";

/**
 * Synchronize user from Auth0 post-registration hook
 * Note: This route uses 'req.body' directly as it is called by an internal hook
 */
export const syncUser = async (req: Request, res: Response) => {
  const data = {
    ...req.body,
    displayName: req.body.displayName || req.body.email.split("@")[0],
  };

  const user = await userService.syncUser(data);
  return res.status(201).json(user);
};

/**
 * Get the currently authenticated user
 */
export const getCurrentUser = async (req: Request, res: Response) => {
  // If the request reached here, req.user is guaranteed to exist
  return res.json(req.user);
};

/**
 * Update user profile details
 */
export const updateUser = async (req: Request, res: Response) => {
  // We use the ID from the hydrated user object
  const user: User = req.user!;

  const updatedUser = await userService.updateUser(user.id, req.body);
  return res.json(updatedUser);
};

/**
 * Initiate user soft-delete and cleanup
 */
export const deleteUser = async (req: Request, res: Response) => {
  const user: User = req.user!;

  await userService.deleteUser(user.id);
  return res.status(204).send();
};
