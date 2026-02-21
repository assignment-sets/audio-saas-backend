import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type {
  SyncUserInput,
  UpdateUserInput,
  GetUserInput,
} from './user.schema';
import { logger } from '../../config/logging_setup/logger';
import { management } from '../../lib/auth0.client';
import {
  NotFoundError,
  ForbiddenError,
  InternalServerError,
  BadRequestError,
} from '../../lib/errors';
import { addJob } from '../../lib/queue.client';
import { JobName } from '../../queues/types';

export const syncUser = async (data: SyncUserInput): Promise<User> => {
  try {
    return await prisma.user.upsert({
      where: { id: data.id },
      update: { email: data.email, displayName: data.displayName },
      create: {
        id: data.id,
        email: data.email,
        displayName: data.displayName || 'unknown',
      },
    });
  } catch (error: unknown) {
    logger.error(
      { err: error, userId: data.id },
      'Prisma upsert failed during user sync',
    );
    throw error;
  }
};

/**
 * Fetches a user only if they are active (not blocked or soft-deleted)
 */
export const getUserById = async (
  input: GetUserInput,
): Promise<User | null> => {
  try {
    return await prisma.user.findFirst({
      where: {
        id: input.id,
        isBlocked: false,
        deletedAt: null,
      },
    });
  } catch (error: unknown) {
    logger.error({ err: error, userId: input.id }, 'Failed to fetch user');
    throw error;
  }
};

export const updateUser = async (
  id: string,
  data: UpdateUserInput,
): Promise<User> => {
  const isSocial = id.includes('google') || id.includes('oauth');
  if (isSocial) {
    throw new ForbiddenError(
      'Updates not permitted for social login accounts.',
    );
  }

  // Fetching current state for potential rollback
  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { email: true, displayName: true },
  });

  if (!existingUser) throw new NotFoundError('User not found');

  const auth0Payload: Record<string, string> = {};
  if (data.displayName) auth0Payload.name = data.displayName;
  if (data.email) auth0Payload.email = data.email;

  let auth0Updated = false;

  if (Object.keys(auth0Payload).length > 0) {
    try {
      await management.users.update(id, auth0Payload);
      auth0Updated = true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Auth0 error';
      logger.error({ err: message, userId: id }, 'Auth0 Update Failed');
      throw new BadRequestError(`Identity provider update failed: ${message}`);
    }
  }

  try {
    return await prisma.user.update({
      where: { id },
      data,
    });
  } catch (error: unknown) {
    if (auth0Updated) {
      // Rollback Auth0 if DB update fails
      await management.users
        .update(id, {
          name: existingUser.displayName,
          email: existingUser.email,
        })
        .catch((err) =>
          logger.error({ err, userId: id }, 'CRITICAL: Auth0 rollback failed'),
        );
    }
    throw new InternalServerError('Internal database update failed');
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!user) throw new NotFoundError('User not found');
  if (user.deletedAt) return; // Already soft-deleted

  // 1. Block in Auth0 (Immediate login prevention)
  try {
    await management.users.update(id, { blocked: true });
  } catch (error: unknown) {
    logger.error({ err: error, userId: id }, 'Failed to block user in Auth0');
    throw new InternalServerError('Identity provider communication failed');
  }

  // 2. Soft delete in DB
  try {
    await prisma.user.update({
      where: { id },
      data: { isBlocked: true, deletedAt: new Date() },
    });
  } catch (error: unknown) {
    // Rollback Auth0 block if DB fails
    await management.users.update(id, { blocked: false }).catch(() => {});
    throw new InternalServerError('Database soft-delete failed');
  }

  // 3. Queue hard delete cleanup
  await addJob(JobName.USER_CLEANUP, { userId: id }).catch((err) => {
    logger.error({ err, userId: id }, 'Failed to queue cleanup job');
  });
};
