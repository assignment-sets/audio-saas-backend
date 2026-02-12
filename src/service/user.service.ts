// src/service/user.service.ts ~annotator~
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type {
  SyncUserInput,
  UpdateUserInput,
  GetUserInput,
} from "../schemas/user.schema";
import { logger } from "../config/logger";
import { management } from "../lib/auth0.client";
import { fgaClient } from "../lib/fga.client";
import {
  NotFoundError,
  ForbiddenError,
  InternalServerError,
  BadRequestError,
} from "../lib/errors";
import { addJob } from "../lib/queue.client";
import { JobName } from "../queues/types";

export const syncUser = async (data: SyncUserInput): Promise<User> => {
  try {
    const user = await prisma.user.upsert({
      where: { id: data.id },
      update: { email: data.email, displayName: data.displayName },
      create: {
        id: data.id,
        email: data.email,
        displayName: data.displayName || "unknown",
      },
    });

    logger.info({ userId: user.id }, "User synced to database successfully");
    return user;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { err: message, userId: data.id },
      "Prisma upsert failed during user sync",
    );
    throw error;
  }
};

export const getUserById = async (
  input: GetUserInput,
): Promise<User | null> => {
  try {
    return await prisma.user.findUnique({ where: { id: input.id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: message, userId: input.id }, "Failed to fetch user");
    throw error;
  }
};

// TODO: email verification during updation
export const updateUser = async (
  id: string,
  data: UpdateUserInput,
): Promise<User> => {
  const isSocial = id.includes("google") || id.includes("oauth");

  if (isSocial) {
    logger.warn({ userId: id }, "Update blocked: Social account");
    throw new ForbiddenError(
      "Updates not permitted for social login accounts.",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { email: true, displayName: true },
  });

  if (!existingUser) {
    throw new NotFoundError("User not found in database");
  }

  const auth0Payload: Record<string, string> = {};
  if (data.displayName) auth0Payload.name = data.displayName;
  if (data.email) auth0Payload.email = data.email;

  let auth0Updated = false;

  if (Object.keys(auth0Payload).length > 0) {
    try {
      await management.users.update(id, auth0Payload);
      auth0Updated = true;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown Auth0 error";
      logger.error({ err: message, userId: id }, "Auth0 Update Failed");
      throw new BadRequestError(`Identity provider update failed: ${message}`);
    }
  }

  try {
    return await prisma.user.update({
      where: { id },
      data: {
        ...(data.displayName && { displayName: data.displayName }),
        ...(data.email && { email: data.email }),
      },
    });
  } catch (error: unknown) {
    if (auth0Updated) {
      await management.users
        .update(id, {
          name: existingUser.displayName,
          email: existingUser.email,
        })
        .catch((rbErr: unknown) => {
          const rbMsg = rbErr instanceof Error ? rbErr.message : String(rbErr);
          logger.error(
            { err: rbMsg, userId: id },
            "CRITICAL: Auth0 rollback failed. Data is now out of sync.",
          );
        });
    }
    const dbMsg = error instanceof Error ? error.message : "Unknown DB error";
    logger.error({ err: dbMsg, userId: id }, "Prisma update failed");
    throw new InternalServerError("Internal database update failed");
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  // DB User Existence Check
  // We fetch it first to ensure the user exists and to check if they are already deleted
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!user) {
    throw new NotFoundError("User not found in database");
  }

  if (user.deletedAt) {
    logger.warn(
      { userId: id },
      "Delete attempted on already soft-deleted user",
    );
    return; // Or throw BadRequest if you prefer
  }

  // Auth0 "Soft Block"
  // This prevents the user from logging in immediately without deleting the account yet.
  try {
    // In Auth0 Management API, the field is literally 'blocked'
    await management.users.update(id, { blocked: true });
    logger.info({ userId: id }, "User blocked in Auth0");
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown Auth0 error";
    logger.error({ err: message, userId: id }, "Failed to block user in Auth0");
    throw new InternalServerError("Identity provider communication failed");
  }

  // Database Soft Delete
  try {
    await prisma.user.update({
      where: { id },
      data: {
        isBlocked: true,
        deletedAt: new Date(),
      },
    });
    logger.info({ userId: id }, "User marked as deleted in database");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: message, userId: id }, "Database soft-delete failed");

    // Optional: Try to unblock in Auth0 if DB fails to stay in sync
    await management.users.update(id, { blocked: false }).catch(() => {
      logger.error(
        { userId: id },
        "Critical: Failed to rollback Auth0 block after DB failure",
      );
    });

    throw new InternalServerError("Failed to initiate account deletion");
  }

  // Push background cleanup task to queue to hard delete user
  try {
    await addJob(JobName.USER_CLEANUP, { userId: id });
    logger.info({ userId: id }, "User cleanup job pushed to queue");
  } catch (error: unknown) {
    // If the queue push fails, we log it.
    // Since the user is blocked, we can manually retry this or
    // run a "sweep" script later.
    logger.error({ err: error, userId: id }, "Failed to queue cleanup job!");
  }
};
