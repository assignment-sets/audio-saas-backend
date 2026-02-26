import type { ArtistProfile } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { CreateArtistInput, UpdateArtistInput } from './artist.schema';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../lib/errors';
import { logger } from '../../config/logging_setup/logger';
import { fgaClient } from '../../lib/fga.client';
import { addJob } from '../../lib/queue.client';
import { JobName } from '../../queues/types';
import { OutboxStatus, Prisma } from '@prisma/client';
import { OutboxIntentTypes } from '../../config/constants/constants';

// Centralized Prisma error handler to reduce boilerplate
const handlePrismaError = (
  error: unknown,
  actionMsg: string,
  logMeta: object,
) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = error.meta?.target as string[] | undefined;
      if (target?.includes('user_id')) {
        throw new BadRequestError(
          'Artist profile already exists for this user',
        );
      }
      if (target?.includes('artist_name')) {
        throw new BadRequestError('Artist name is already taken');
      }
      throw new BadRequestError('A unique constraint failed');
    }
    if (error.code === 'P2025') {
      throw new NotFoundError('Artist profile not found');
    }
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error({ err: errorMessage, ...logMeta }, `Failed to ${actionMsg}`);
  throw new BadRequestError(`Could not ${actionMsg} at this time`);
};

export const createProfile = async (
  userId: string,
  data: CreateArtistInput,
): Promise<ArtistProfile> => {
  try {
    const { profile, outboxTask } = await prisma.$transaction(async (tx) => {
      const newProfile = await tx.artistProfile.create({
      data: {
        userId,
        artistName: data.artistName,
        bio: data.bio,
      },
    });

      // Use Prisma.InputJsonObject to enforce strict type safety without `any`
      const payload: Prisma.InputJsonObject = {
        userId,
        profileId: newProfile.id,
      };

      const task = await tx.outbox.create({
        data: {
          type: OutboxIntentTypes.CREATE_ARTIST_PROFILE,
          payload,
          status: OutboxStatus.PENDING,
        },
      });

      return { profile: newProfile, outboxTask: task };
    });

    try {
      await addJob(JobName.PROCESS_OUTBOX, { outboxId: outboxTask.id });
    } catch (queueError: unknown) {
      const msg =
        queueError instanceof Error ? queueError.message : String(queueError);
      logger.error(
        { err: msg, outboxId: outboxTask.id },
        'Failed to add outbox job to queue immediately, will be picked up by sweeper',
      );
    }

    return profile;
  } catch (error: unknown) {
    handlePrismaError(error, 'create artist profile', { userId });
    // This return is unreachable because handlePrismaError throws,
    // but TS might complain without a return or assert never depending on strict settings.
    throw error;
  }
};

export const getProfileByName = async (
  artistName: string,
): Promise<ArtistProfile> => {
  const profile = await prisma.artistProfile.findUnique({
    where: { artistName },
    include: {
      user: {
        select: { isBlocked: true }, // deletedAt is handled by the Prisma extension
      },
      albums: {
        orderBy: { releaseDate: 'desc' },
        take: 5,
        },
      tracks: {
        where: {
          state: 'ready', // Track uses state instead of deletedAt
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      _count: {
        select: {
          followers: true,
          tracks: {
            where: { state: 'ready' }, // Only count ready tracks
          },
          albums: true,
        },
      },
    },
  });

  // Check if profile exists AND if the underlying user is active
  if (!profile || profile.user.isBlocked || profile.user.deletedAt) {
    throw new NotFoundError('Artist not found');
  }

  return profile;
};

export const getProfileById = async (
  id: string,
  requesterId: string,
): Promise<ArtistProfile> => {
  // Execute network calls concurrently to slash latency
  const [managerCheck, moderatorCheck] = await Promise.all([
    fgaClient.check({
      user: `user:${requesterId}`,
      relation: 'can_manage',
      object: `artist_profile:${id}`,
    }),
    fgaClient.check({
      user: `user:${requesterId}`,
      relation: 'can_moderate',
      object: `artist_profile:${id}`,
    }),
  ]);

  if (!managerCheck.allowed && !moderatorCheck.allowed) {
    throw new ForbiddenError('Inadequate permissions to access this profile');
  }

  const profile = await prisma.artistProfile.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          followers: true,
          tracks: {
            where: { state: 'ready' }, // Ensure managers see the correct track count
          },
        },
      },
    },
  });

  if (!profile) throw new NotFoundError('Artist profile not found');
  return profile;
};

export const updateProfile = async (
  requesterId: string,
  profileId: string,
  data: UpdateArtistInput,
): Promise<ArtistProfile> => {
  const { allowed } = await fgaClient.check({
    user: `user:${requesterId}`,
    relation: 'can_manage',
    object: `artist_profile:${profileId}`,
    });

  if (!allowed) {
    throw new ForbiddenError(
      'You do not have permission to update this profile',
    );
    }

  try {
    return await prisma.artistProfile.update({
      where: { id: profileId },
      data,
    });
  } catch (error: unknown) {
    handlePrismaError(error, 'update artist profile', {
      requesterId,
      profileId,
    });
    throw error;
  }
};
