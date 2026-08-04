import type { User, Subscription } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env_setup/env';
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
  PaymentRequiredError,
} from '../../lib/errors';
import { hasActiveMeteredSubscription } from '../../middleware/billing/meteredBilling.middleware';
import { addUserJob } from '../../lib/queue.client';
import { JobName } from '../../queues/types';

export enum UserTier {
  FREE = 'FREE',
  LITE = 'LITE',
  PRO = 'PRO',
}

export const getUserTier = (subscriptions: Subscription[]): UserTier => {
  const activeSub = subscriptions.find(
    (sub) =>
      (sub.status === 'active' || sub.status === 'trialing') &&
      new Date(sub.currentPeriodEnd) > new Date(),
  );

  if (!activeSub) return UserTier.FREE;
  if (activeSub.stripePriceId === env.STRIPE_PRO_PRICE_ID) return UserTier.PRO;
  if (activeSub.stripePriceId === env.STRIPE_LITE_PRICE_ID)
    return UserTier.LITE;

  return UserTier.FREE;
};

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
  const cleanId = id.trim();

  const isSocial = cleanId.includes('google') || cleanId.includes('oauth');
  if (isSocial) {
    throw new ForbiddenError(
      'Updates not permitted for social login accounts.',
    );
  }

  let existingUser;
  try {
    existingUser = await prisma.user.findFirst({
      where: { id: cleanId },
      select: { email: true, displayName: true },
    });
  } catch (prismaError) {
    console.error(
      '🚨 [CRITICAL] Prisma engine threw an actual error:',
      prismaError,
    );
    throw prismaError;
  }

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
  await addUserJob(JobName.USER_CLEANUP, { userId: id }).catch((err) => {
    logger.error({ err, userId: id }, 'Failed to queue cleanup job');
  });
};

export const createApiKey = async (
  userId: string,
  name: string,
): Promise<{ id: string; name: string; rawKey: string; createdAt: Date }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscriptions: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const tier = getUserTier(user.subscriptions);

  if (
    tier === UserTier.FREE &&
    !hasActiveMeteredSubscription(user.subscriptions)
  ) {
    throw new PaymentRequiredError(
      'A valid payment method is required to generate API keys. Please complete setup checkout to save your card.',
    );
  }

  const rawKey = 'ak_live_' + crypto.randomBytes(24).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      name,
      keyHash,
    },
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    rawKey,
    createdAt: apiKey.createdAt,
  };
};

export const listApiKeys = async (
  userId: string,
): Promise<Array<{ id: string; name: string; createdAt: Date }>> => {
  return prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const deleteApiKey = async (
  userId: string,
  id: string,
): Promise<void> => {
  const key = await prisma.apiKey.findUnique({
    where: { id },
  });

  if (!key) {
    throw new NotFoundError('API Key not found');
  }

  if (key.userId !== userId) {
    throw new ForbiddenError('You are not authorized to delete this API Key');
  }

  await prisma.apiKey.delete({
    where: { id },
  });
};
